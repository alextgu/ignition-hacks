/**
 * Environment-driven configuration for the World Labs integration.
 *
 * Every value here is read lazily (not at module load time) so that tests
 * can set the environment before calling `loadConfig()` without needing to
 * re-import the module. No secret is ever logged: `describeConfig` below
 * exists specifically so callers can log/debug configuration state without
 * risking printing the API key.
 */

import { readEnv } from "../shared/encoding.ts";

/** Anything key-value that config can be read from. Avoids depending on Node types. */
export type EnvLike = Record<string, string | undefined>;

export type WorldLabsConfig = {
  /** Secret API key. Required for the real adapter; absent -> mock is used. */
  apiKey: string | undefined;
  /** Base URL for the World Labs API. Overridable for tests. */
  baseUrl: string;
  /** Generation model. See docs/world-labs-setup.md for valid values. */
  model: string;
  /** Per-HTTP-call timeout, in milliseconds. */
  timeoutMs: number;
  /** When true, forces the mock adapter even if an API key is present. */
  forceMock: boolean;
};

const DEFAULT_BASE_URL = "https://api.worldlabs.ai";
const DEFAULT_MODEL = "marble-1.1";
const DEFAULT_TIMEOUT_MS = 15_000;

/** Returns the first non-empty value among `names`, trimmed. */
function firstSet(env: EnvLike, names: string[]): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Reads World Labs configuration from the environment. Never throws. */
export function loadConfig(env: EnvLike = readEnv()): WorldLabsConfig {
  return {
    // Aliases: the team's .env.example uses WLT_API_KEY (matching the
    // WLT-Api-Key header) and WORLD_LABS_API_KEY. Accept all three so a
    // correctly-filled .env never silently falls through to the mock.
    // WORLD_LABS_KEY is the name actually used in the team's .env and in the
    // embed design doc; leaving it out meant a correctly-filled .env fell
    // silently through to the mock.
    apiKey: firstSet(env, [
      "WORLDLABS_API_KEY",
      "WLT_API_KEY",
      "WORLD_LABS_API_KEY",
      "WORLD_LABS_KEY",
    ]),
    baseUrl: env.WORLDLABS_BASE_URL?.trim() || DEFAULT_BASE_URL,
    model: env.WORLDLABS_MODEL?.trim() || DEFAULT_MODEL,
    timeoutMs: parsePositiveInt(env.WORLDLABS_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    forceMock: parseBoolean(env.WORLDLABS_FORCE_MOCK),
  };
}

/** True when the real World Labs API should be used instead of the mock. */
export function shouldUseRealAdapter(config: WorldLabsConfig): boolean {
  return Boolean(config.apiKey) && !config.forceMock;
}

/** Safe-to-log summary of the current configuration (never includes the key). */
export function describeConfig(config: WorldLabsConfig): Record<string, unknown> {
  return {
    apiKeyConfigured: Boolean(config.apiKey),
    baseUrl: config.baseUrl,
    model: config.model,
    timeoutMs: config.timeoutMs,
    forceMock: config.forceMock,
    usingRealAdapter: shouldUseRealAdapter(config),
  };
}
