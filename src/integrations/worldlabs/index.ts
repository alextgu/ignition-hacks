/**
 * Public entry point for the World Labs integration.
 *
 * Application code should import ONLY from this file (or from `./types.ts`
 * for the plain type declarations) — never reach into worldLabsAdapter.ts,
 * mockAdapter.ts, or internalApiTypes.ts directly. That keeps the World
 * Labs API surface fully isolated behind `WorldSeed` / `WorldResult`.
 *
 * Usage:
 *
 *   import { generateWorld, getWorldStatus } from "src/integrations/worldlabs";
 *
 *   const result = await generateWorld(seed);
 *   // ... later ...
 *   const updated = result.externalId
 *     ? await getWorldStatus(result.externalId)
 *     : result;
 *
 * Whether this ends up calling the real World Labs API or the deterministic
 * mock is decided once, from environment configuration (see
 * docs/world-labs-setup.md), and is invisible to the caller either way.
 */

import { loadConfig, shouldUseRealAdapter, describeConfig } from "./config.ts";
import { RealWorldLabsAdapter } from "./worldLabsAdapter.ts";
import { MockWorldLabsAdapter } from "./mockAdapter.ts";
import { readEnv } from "../shared/encoding.ts";
import type { WorldLabsAdapter, WorldResult, WorldSeed } from "./types.ts";

export type { WorldSeed, WorldResult, WorldStatus, WorldLabsAdapter } from "./types.ts";
export { buildWorldPrompt, buildWorldDisplayName } from "./promptMapper.ts";

let cachedAdapter: WorldLabsAdapter | undefined;

/**
 * Builds a fresh adapter from the current environment. Most callers should
 * use `getWorldLabsAdapter()` (memoized) or the `generateWorld` /
 * `getWorldStatus` convenience exports instead of calling this directly;
 * it's exposed mainly for tests and for callers that need to react to
 * environment changes without restarting the process.
 */
export function createWorldLabsAdapter(env: EnvLike = readEnv()): WorldLabsAdapter {
  const config = loadConfig(env);
  return shouldUseRealAdapter(config)
    ? new RealWorldLabsAdapter(config)
    : new MockWorldLabsAdapter();
}

/** Returns a process-wide singleton adapter, selected from the environment on first use. */
export function getWorldLabsAdapter(): WorldLabsAdapter {
  if (!cachedAdapter) {
    cachedAdapter = createWorldLabsAdapter();
  }
  return cachedAdapter;
}

/** Resets the memoized singleton. Intended for tests only. */
export function resetWorldLabsAdapterForTests(): void {
  cachedAdapter = undefined;
}

/** Safe-to-log summary of how World Labs is currently configured (no secrets). */
export function describeWorldLabsConfig(env: EnvLike = readEnv()): Record<string, unknown> {
  return describeConfig(loadConfig(env));
}

export async function generateWorld(seed: WorldSeed): Promise<WorldResult> {
  return getWorldLabsAdapter().generateWorld(seed);
}

export async function getWorldStatus(externalId: string): Promise<WorldResult> {
  return getWorldLabsAdapter().getWorldStatus(externalId);
}
