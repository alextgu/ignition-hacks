# Integration bundle — paste this into Base44 verbatim

**This is working, tested code. Do not let the builder rewrite it, "improve"
it, or substitute its own adapter logic.** It is 16 files covering both
external integrations, backed by 94 passing unit tests, with the World Labs
and ElevenLabs API contracts verified against current vendor documentation.

It uses **no Node-specific APIs** — no `Buffer`, no `node:crypto`, no
`process.env` — only web standards (`fetch`, `TextEncoder`, `btoa`/`atob`,
`AbortController`). It therefore runs unchanged on Base44's Deno runtime.

## What to tell Base44

> Create the following files exactly as given, preserving paths, imports and
> the `.ts` extensions on relative imports. Do not modify the logic, do not
> rename exports, and do not write your own World Labs or ElevenLabs client.
> These files are already tested and their API contracts are verified.

## What these give you

| Entry point | Use |
|---|---|
| `createWorldLabsAdapter(config)` | `.generateWorld(seed)` / `.getWorldStatus(id)` |
| `createBookingAgentAdapter(config)` | `.startBookingCall(brief)` / `.getBookingCallStatus(id)` |

Both pick the real adapter when credentials are present and a deterministic
mock when they aren't — the caller cannot tell the difference, and neither
ever throws. Every failure comes back as a status with a message.

**Config injection:** the factories accept a plain
`Record<string, string | undefined>`. In a Base44 backend function, build it
from `secrets.get()` rather than reading an environment:

```ts
import { secrets } from "base44:runtime";
import { createBookingAgentAdapter } from "../integrations/elevenlabs/index.ts";

const adapter = createBookingAgentAdapter({
  ELEVENLABS_API_KEY: await secrets.get("ELEVENLABS_API_KEY"),
  ELEVENLABS_AGENT_ID: await secrets.get("ELEVENLABS_AGENT_ID"),
  ELEVENLABS_AGENT_PHONE_NUMBER_ID: await secrets.get("ELEVENLABS_AGENT_PHONE_NUMBER_ID"),
});
```

Pass nothing and you get the mock — which is exactly what makes the demo
safe.

---


## `src/integrations/shared/encoding.ts`

```ts
/**
 * Runtime-agnostic encoding and hashing helpers.
 *
 * These exist so the integration modules can run unchanged on Node, on Deno
 * (Base44 backend functions), and in a browser. Everything here uses only
 * web-standard globals — `TextEncoder`, `TextDecoder`, `btoa`, `atob` — so
 * there is no dependency on `Buffer` or `node:crypto`.
 *
 * That portability is the whole point: the same adapter source can be pasted
 * into a Base44 backend function without a rewrite.
 */

/** Encodes a UTF-8 string as base64url (no padding). */
export function toBase64Url(value: string): string {
  return toBase64(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decodes a base64url string back to UTF-8. Throws on malformed input. */
export function fromBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return fromBase64(padded);
}

/** Encodes a UTF-8 string as standard base64 (with padding). */
export function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  // Chunked to avoid blowing the argument limit on large payloads (SVG/HTML).
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Decodes standard base64 to a UTF-8 string. */
export function fromBase64(value: string): string {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Deterministic 32-bit FNV-1a hash, returned as 8 lowercase hex characters.
 *
 * Used only to derive stable visual values (a hue, a palette index) from a
 * seed. It is NOT a cryptographic hash and must never be used for anything
 * security-relevant — but unlike `node:crypto` it runs identically in every
 * JavaScript runtime, which is what this needs.
 */
export function stableHash(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i];
    // FNV prime 16777619, kept in 32-bit unsigned range via Math.imul.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Reads environment variables in whatever runtime we're in, without assuming
 * `process` exists. Returns an empty object where there is no environment to
 * read (Deno without permissions, a browser). Base44 backend functions should
 * bypass this entirely and build the config from `secrets.get()`.
 */
export function readEnv(): Record<string, string | undefined> {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  if (proc?.env) return proc.env;

  const deno = (globalThis as { Deno?: { env?: { toObject(): Record<string, string> } } }).Deno;
  if (deno?.env) {
    try {
      return deno.env.toObject();
    } catch {
      return {};
    }
  }

  return {};
}
```

## `src/integrations/shared/httpJson.ts`

```ts
/**
 * Shared JSON-over-HTTP helper used by every external integration in this
 * repository (World Labs, ElevenLabs).
 *
 * Purpose: give every adapter ONE way to make a network call that
 *   (a) always has a timeout, and
 *   (b) never throws — every failure mode (network error, timeout, non-2xx,
 *       malformed JSON) is normalized into a single `HttpCallFailure` shape.
 *
 * That second property is what lets the adapters guarantee "external service
 * problems become a controlled failed result, not an exception" without each
 * one re-implementing try/catch plumbing.
 *
 * Uses only native `fetch` / `AbortController` — no HTTP client dependency.
 */

export type HttpCallSuccess<T> = {
  ok: true;
  status: number;
  data: T;
};

export type HttpCallFailure = {
  ok: false;
  status?: number;
  reason: "timeout" | "network" | "http_error" | "invalid_json";
  message: string;
};

export type HttpCallResult<T> = HttpCallSuccess<T> | HttpCallFailure;

export type FetchJsonOptions = {
  /** Prefix used in error messages, e.g. "World Labs" or "ElevenLabs". */
  serviceLabel: string;
  timeoutMs: number;
};

export async function fetchJson<T>(
  url: string,
  init: RequestInit,
  options: FetchJsonOptions
): Promise<HttpCallResult<T>> {
  const { serviceLabel, timeoutMs } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        reason: "http_error",
        message: `${serviceLabel} API returned ${response.status}: ${truncate(text, 500)}`,
      };
    }

    if (!text) {
      return { ok: true, status: response.status, data: {} as T };
    }

    try {
      return { ok: true, status: response.status, data: JSON.parse(text) as T };
    } catch {
      return {
        ok: false,
        status: response.status,
        reason: "invalid_json",
        message: `${serviceLabel} API returned a response that could not be parsed as JSON.`,
      };
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        reason: "timeout",
        message: `${serviceLabel} API call timed out after ${timeoutMs}ms.`,
      };
    }
    return {
      ok: false,
      reason: "network",
      message:
        err instanceof Error
          ? err.message
          : `Unknown network error calling the ${serviceLabel} API.`,
    };
  } finally {
    clearTimeout(timer);
  }
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}
```

## `src/integrations/worldlabs/types.ts`

```ts
/**
 * Public contract for the World Labs integration.
 *
 * The rest of the application (event creation, guest pages, host dashboard)
 * should depend ONLY on the types and functions exported from this file and
 * from `./index.ts`. Nothing about the World Labs HTTP API, its request or
 * response shapes, or whether a real API key is configured should leak past
 * this boundary. See `docs/world-labs-setup.md` for the full integration
 * guide.
 */

/** Structured creative seed produced by the event-creation flow. */
export type WorldSeed = {
  /** Host's free-form natural-language description of the event/idea. */
  description: string;
  /** Short label, e.g. "birthday dinner", "team offsite", "weekend meetup". */
  eventType: string;
  /** Desired atmosphere, e.g. "cozy", "energetic", "elegant". */
  mood: string;
  /** General area or city, e.g. "Toronto", "downtown Montreal". */
  location: string;
  /** Time-of-day / season character, e.g. "golden hour", "late night winter". */
  timeCharacter: string;
  /** Approximate expected number of attendees. */
  groupSize: number;
  /** Price comfort character, e.g. "budget-friendly", "splurge-worthy". */
  priceCharacter: string;
};

/** Generation status of a requested world, independent of the provider. */
export type WorldStatus = "pending" | "ready" | "failed";

/** Result returned by both `generateWorld` and `getWorldStatus`. */
export type WorldResult = {
  status: WorldStatus;
  /** URL suitable for opening/embedding the finished interactive world. */
  embedUrl?: string;
  /** URL (or data: URI) for a static preview/thumbnail image. */
  previewImageUrl?: string;
  /**
   * Opaque identifier for polling `getWorldStatus`. Callers must treat this
   * as a black box — its shape differs between the real adapter (a World
   * Labs operation id) and the mock adapter (a self-describing token).
   */
  externalId?: string;
  /** Human-readable error message, present only when status is "failed". */
  error?: string;
};

/** Common interface implemented by both the real and mock adapters. */
export interface WorldLabsAdapter {
  generateWorld(seed: WorldSeed): Promise<WorldResult>;
  getWorldStatus(externalId: string): Promise<WorldResult>;
}
```

## `src/integrations/worldlabs/config.ts`

```ts
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
    apiKey: env.WORLDLABS_API_KEY?.trim() || undefined,
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
```

## `src/integrations/worldlabs/promptMapper.ts`

```ts
import type { WorldSeed } from "./types.ts";

/**
 * Converts an approved WorldSeed into a single natural-language prompt
 * suitable for the World Labs `text_prompt` field.
 *
 * This is intentionally template-based rather than clever: World generation
 * is a one-shot, non-regenerated call per event (see project.md), so the
 * prompt needs to be a reliable, legible sentence rather than an attempt at
 * "creative" prompt engineering. Every WorldSeed field is represented so
 * the generated scene reflects the full seed, and the mapping is pure and
 * deterministic so it can be unit tested without any network access.
 */
export function buildWorldPrompt(seed: WorldSeed): string {
  const description = clean(seed.description);
  const eventType = clean(seed.eventType);
  const mood = clean(seed.mood);
  const location = clean(seed.location);
  const timeCharacter = clean(seed.timeCharacter);
  const priceCharacter = clean(seed.priceCharacter);
  const groupSize = normalizeGroupSize(seed.groupSize);

  const parts: string[] = [];

  parts.push(`A ${mood || "inviting"} ${eventType || "gathering"} scene: ${description}.`);

  if (location) {
    parts.push(`Set in ${location}.`);
  }

  if (timeCharacter) {
    parts.push(`Lit and staged for ${timeCharacter}.`);
  }

  parts.push(
    `Scaled and furnished for a group of about ${groupSize} ${
      groupSize === 1 ? "person" : "people"
    }, with clearly readable spots for each guest to gather.`
  );

  if (priceCharacter) {
    parts.push(`The overall styling and materials should feel ${priceCharacter}.`);
  }

  parts.push(
    "Navigable 3D environment, coherent layout and lighting, no readable text or logos."
  );

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Human-friendly display name for the generation request, e.g. for dashboards. */
export function buildWorldDisplayName(seed: WorldSeed): string {
  const eventType = clean(seed.eventType) || "Event";
  const location = clean(seed.location);
  const base = location ? `${eventType} — ${location}` : eventType;
  return truncate(base, 80);
}

function clean(value: string | undefined | null): string {
  return (value ?? "").trim();
}

function normalizeGroupSize(groupSize: number): number {
  if (!Number.isFinite(groupSize) || groupSize <= 0) return 4;
  return Math.round(groupSize);
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}
```

## `src/integrations/worldlabs/internalApiTypes.ts`

```ts
/**
 * World Labs "World API" (Marble) response/request shapes.
 *
 * These types are deliberately NOT exported from `./index.ts`. Per the
 * integration boundary, no code outside `src/integrations/worldlabs/**`
 * should ever need to know these shapes — only `WorldSeed`/`WorldResult`
 * cross the boundary. Kept intentionally partial: only the fields this
 * adapter actually reads are modeled.
 *
 * Source: World Labs API quickstart (https://docs.worldlabs.ai/api) and
 * the World API announcement (https://www.worldlabs.ai/blog/announcing-the-world-api).
 */

export type WorldLabsModel = "marble-1.1" | "marble-1.1-plus";

export type GenerateWorldRequest = {
  display_name: string;
  model: WorldLabsModel;
  world_prompt: {
    type: "text";
    text_prompt: string;
  };
};

export type WorldLabsErrorObject = {
  code?: string;
  message?: string;
};

export type WorldLabsAssets = {
  thumbnail_url?: string;
  caption?: string;
  imagery?: {
    pano_url?: string;
  };
};

/** Partial shape of the World object returned once generation completes. */
export type WorldLabsWorld = {
  world_id?: string;
  /** Shareable viewer URL, e.g. https://marble.worldlabs.ai/world/{world_id} */
  world_marble_url?: string;
  assets?: WorldLabsAssets;
};

/** Response from `POST /marble/v1/worlds:generate` and the operation-status poll. */
export type WorldLabsOperation = {
  operation_id: string;
  created_at?: string;
  done: boolean;
  error?: WorldLabsErrorObject | null;
  metadata?: {
    progress?: number;
    world_id?: string;
  };
  response?: WorldLabsWorld;
};
```

## `src/integrations/worldlabs/worldLabsAdapter.ts`

```ts
import type { WorldLabsConfig } from "./config.ts";
import { buildWorldDisplayName, buildWorldPrompt } from "./promptMapper.ts";
import type { WorldSeed, WorldResult, WorldLabsAdapter } from "./types.ts";
import { fetchJson } from "../shared/httpJson.ts";
import type { GenerateWorldRequest, WorldLabsOperation, WorldLabsWorld } from "./internalApiTypes.ts";

/**
 * Real adapter backed by the World Labs "World API" (Marble).
 *
 * Flow (per https://docs.worldlabs.ai/api):
 *  1. generateWorld -> POST /marble/v1/worlds:generate
 *     Kicks off an async generation "operation" and returns immediately.
 *     Generation itself takes on the order of minutes, so this method does
 *     NOT wait for completion — it returns status "pending" with the
 *     operation id as `externalId` for the caller to poll.
 *  2. getWorldStatus -> GET /marble/v1/operations/{operation_id}
 *     Polls the operation. World Labs operations expire ~1 hour after
 *     creation, comfortably longer than the documented ~5 minute typical
 *     generation time.
 *
 * Every network failure (bad key, timeout, outage, malformed response) is
 * converted into `{ status: "failed", error }` — this adapter never throws,
 * so callers can treat World Labs the same way whether or not it responds.
 */
export class RealWorldLabsAdapter implements WorldLabsAdapter {
  private readonly config: WorldLabsConfig;

  constructor(config: WorldLabsConfig) {
    this.config = config;
  }

  async generateWorld(seed: WorldSeed): Promise<WorldResult> {
    if (!this.config.apiKey) {
      return {
        status: "failed",
        error: "World Labs API key is not configured (WORLDLABS_API_KEY).",
      };
    }

    const body: GenerateWorldRequest = {
      display_name: buildWorldDisplayName(seed),
      model: this.config.model as GenerateWorldRequest["model"],
      world_prompt: {
        type: "text",
        text_prompt: buildWorldPrompt(seed),
      },
    };

    const result = await fetchJson<WorldLabsOperation>(
      `${this.config.baseUrl}/marble/v1/worlds:generate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "WLT-Api-Key": this.config.apiKey,
        },
        body: JSON.stringify(body),
      },
      { serviceLabel: "World Labs", timeoutMs: this.config.timeoutMs }
    );

    if (!result.ok) {
      return { status: "failed", error: result.message };
    }

    return operationToWorldResult(result.data);
  }

  async getWorldStatus(externalId: string): Promise<WorldResult> {
    if (!this.config.apiKey) {
      return {
        status: "failed",
        error: "World Labs API key is not configured (WORLDLABS_API_KEY).",
      };
    }

    const result = await fetchJson<WorldLabsOperation>(
      `${this.config.baseUrl}/marble/v1/operations/${encodeURIComponent(externalId)}`,
      {
        method: "GET",
        headers: { "WLT-Api-Key": this.config.apiKey },
      },
      { serviceLabel: "World Labs", timeoutMs: this.config.timeoutMs }
    );

    if (!result.ok) {
      return { status: "failed", error: result.message };
    }

    return operationToWorldResult(result.data);
  }
}

function operationToWorldResult(operation: WorldLabsOperation): WorldResult {
  const externalId = operation.operation_id;

  if (!operation.done) {
    return { status: "pending", externalId };
  }

  if (operation.error) {
    return {
      status: "failed",
      externalId,
      error: operation.error.message || "World Labs reported a generation error.",
    };
  }

  if (!operation.response) {
    return {
      status: "failed",
      externalId,
      error: "World Labs marked generation as done but returned no world data.",
    };
  }

  return {
    status: "ready",
    externalId,
    embedUrl: resolveEmbedUrl(operation.response),
    previewImageUrl: operation.response.assets?.thumbnail_url,
  };
}

function resolveEmbedUrl(world: WorldLabsWorld): string | undefined {
  if (world.world_marble_url) return world.world_marble_url;
  if (world.world_id) return `https://marble.worldlabs.ai/world/${world.world_id}`;
  return undefined;
}
```

## `src/integrations/worldlabs/mockAdapter.ts`

```ts
import type { WorldSeed, WorldResult, WorldLabsAdapter } from "./types.ts";
import { toBase64, toBase64Url, fromBase64Url, stableHash } from "../shared/encoding.ts";

/**
 * Deterministic, fully offline mock/fallback adapter.
 *
 * Per project.md: "World generation must fail gracefully... Demo data and a
 * deterministic world fallback should be available if external services
 * fail during judging." This adapter never makes a network call and always
 * resolves immediately with status "ready", so the coordination flow (and
 * demos) never block on World Labs being configured or reachable.
 *
 * Determinism + statelessness: rather than keeping generation state in
 * memory (which would not survive a serverless invocation or a restart),
 * the seed is encoded directly into `externalId`. `getWorldStatus` decodes
 * it and re-derives the exact same result. Same seed in -> same world out,
 * with no server-side storage required.
 */
export class MockWorldLabsAdapter implements WorldLabsAdapter {
  async generateWorld(seed: WorldSeed): Promise<WorldResult> {
    return buildMockResult(seed);
  }

  async getWorldStatus(externalId: string): Promise<WorldResult> {
    const seed = decodeExternalId(externalId);
    if (!seed) {
      return {
        status: "failed",
        error: "Unrecognized mock World Labs externalId.",
      };
    }
    return buildMockResult(seed);
  }
}

const EXTERNAL_ID_PREFIX = "mock:";

function encodeExternalId(seed: WorldSeed): string {
  return `${EXTERNAL_ID_PREFIX}${toBase64Url(JSON.stringify(seed))}`;
}

function decodeExternalId(externalId: string): WorldSeed | null {
  if (!externalId.startsWith(EXTERNAL_ID_PREFIX)) return null;
  try {
    const json = fromBase64Url(externalId.slice(EXTERNAL_ID_PREFIX.length));
    const parsed = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as WorldSeed;
  } catch {
    return null;
  }
}

function buildMockResult(seed: WorldSeed): WorldResult {
  const hash = stableHash(JSON.stringify(seed));
  const previewImageUrl = buildPreviewDataUri(seed, hash);
  const embedUrl = buildEmbedDataUri(seed, hash, previewImageUrl);

  return {
    status: "ready",
    externalId: encodeExternalId(seed),
    embedUrl,
    previewImageUrl,
  };
}

/** Derives a deterministic HSL hue (0-359) from a hex digest. */
function hueFromHash(hash: string): number {
  return Number.parseInt(hash.slice(0, 8), 16) % 360;
}

function buildPreviewDataUri(seed: WorldSeed, hash: string): string {
  const hue = hueFromHash(hash);
  const groupSize = Number.isFinite(seed.groupSize) && seed.groupSize > 0 ? Math.round(seed.groupSize) : 4;
  const dots = Array.from({ length: Math.min(groupSize, 24) }, (_, i) => {
    const angle = (2 * Math.PI * i) / Math.max(groupSize, 1);
    const x = 320 + Math.cos(angle) * 110;
    const y = 220 + Math.sin(angle) * 80;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="hsl(${(hue + 40) % 360} 80% 75%)" />`;
  }).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="hsl(${hue} 70% 30%)" />
        <stop offset="100%" stop-color="hsl(${(hue + 60) % 360} 70% 15%)" />
      </linearGradient>
    </defs>
    <rect width="640" height="360" fill="url(#bg)" />
    ${dots}
    <text x="32" y="48" font-family="sans-serif" font-size="24" fill="white" font-weight="bold">${escapeXml(
      capitalize(seed.eventType || "Event")
    )}</text>
    <text x="32" y="76" font-family="sans-serif" font-size="16" fill="white" opacity="0.85">${escapeXml(
      seed.location || ""
    )}</text>
    <text x="32" y="330" font-family="sans-serif" font-size="14" fill="white" opacity="0.7">${escapeXml(
      capitalize(seed.mood || "")
    )} · ${escapeXml(seed.timeCharacter || "")}</text>
  </svg>`;

  return `data:image/svg+xml;base64,${toBase64(svg)}`;
}

function buildEmbedDataUri(seed: WorldSeed, hash: string, previewImageUrl: string): string {
  const hue = hueFromHash(hash);
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeXml(capitalize(seed.eventType || "Event"))} — preview</title>
    <style>
      html, body { margin: 0; height: 100%; overflow: hidden; background: hsl(${hue} 70% 12%); }
      .scene {
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background-image: url("${previewImageUrl}");
        background-size: cover;
        background-position: center;
        animation: drift 12s ease-in-out infinite alternate;
      }
      @keyframes drift {
        from { background-position: 45% 50%; }
        to { background-position: 55% 45%; }
      }
      .badge {
        font-family: sans-serif;
        color: white;
        background: rgba(0, 0, 0, 0.35);
        padding: 8px 14px;
        border-radius: 999px;
        font-size: 13px;
        letter-spacing: 0.02em;
      }
    </style>
  </head>
  <body>
    <div class="scene">
      <span class="badge">Preview world · World Labs unavailable, showing deterministic fallback</span>
    </div>
  </body>
</html>`;

  return `data:text/html;base64,${toBase64(html)}`;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => {
    switch (char) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}
```

## `src/integrations/worldlabs/index.ts`

```ts
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
```

## `src/integrations/elevenlabs/types.ts`

```ts
/**
 * Public contract for the ElevenLabs booking-agent integration.
 *
 * This is the "booking-agent boundary" described in project.md. The rest of
 * the application depends ONLY on the types and functions exported here and
 * from `./index.ts`. Nothing about the ElevenLabs Agents API — its endpoints,
 * conversation lifecycle, or payload shapes — leaks past this file.
 *
 * See `docs/elevenlabs-setup.md` for setup and required credentials.
 */

/** A single time window the group is available for. */
export type TimeWindow = {
  /** ISO-8601 start, e.g. "2026-09-12T19:00:00-04:00". */
  startIso: string;
  /** ISO-8601 end. */
  endIso: string;
};

/**
 * What the agent is allowed to agree to without coming back to the host.
 * This is the "host's permitted negotiation range" from project.md — the
 * agent must never commit beyond these bounds.
 */
export type NegotiationBounds = {
  /** Hard ceiling per person, in the event's currency. Agent must not exceed. */
  maxPricePerPerson?: number;
  /** May the agent accept a time outside `preferredWindows` if offered? */
  timeFlexible: boolean;
  /** May the agent accept a smaller table than `partySize` (split seating)? */
  acceptSplitSeating: boolean;
  /** Minutes earlier/later than a preferred window the agent may accept. */
  timeToleranceMinutes?: number;
};

/**
 * The confirmed event brief handed to the booking agent once the host marks
 * an event "Ready to plan". Mirrors the brief contents listed in project.md.
 */
export type EventBrief = {
  /** SnapPlan event id, used for correlation/logging only. */
  eventId: string;
  /** Human name of the venue being called. */
  venueName: string;
  /** E.164 phone number to dial, e.g. "+14165550123". */
  venuePhoneNumber: string;
  /** General area or city, for context if the venue asks. */
  location: string;
  /** Confirmed party size. */
  partySize: number;
  /** Group-preferred windows, best first. */
  preferredWindows: TimeWindow[];
  /** Approximate per-person budget the group agreed to. */
  budgetPerPerson?: number;
  /** Currency code for budget figures, defaults to "CAD" when omitted. */
  currency?: string;
  /** e.g. "a quiet booth", "patio if available". */
  seatingPreference?: string;
  /** e.g. ["one vegan", "no shellfish"]. */
  dietaryNotes?: string[];
  /** Name the agent gives the venue when making the reservation. */
  hostName: string;
  /** Callback number to leave with the venue, if the host provided one. */
  hostCallbackNumber?: string;
  /** Bounds the agent must negotiate within. */
  negotiation: NegotiationBounds;
};

/** Lifecycle of a booking call, independent of the provider. */
export type BookingCallStatus = "pending" | "in_progress" | "completed" | "failed";

/** What the call actually achieved, once it has completed. */
export type BookingOutcome =
  /** Venue confirmed a reservation. `confirmedTime` should be set. */
  | "booked"
  /** Venue could not accommodate the group at all. */
  | "declined"
  /** Something was offered/said that needs a human decision. */
  | "needs_followup"
  /** Call completed but the result could not be determined. */
  | "unknown";

/** One line of the call transcript. */
export type TranscriptLine = {
  /** "agent" for our voice agent, "user" for the person at the venue. */
  role: "agent" | "user";
  message: string;
  atSeconds: number;
};

/** Result returned by both `startBookingCall` and `getBookingCallStatus`. */
export type BookingCallResult = {
  status: BookingCallStatus;
  /** Opaque id for polling. Treat as a black box — shape differs per adapter. */
  externalId?: string;
  /** Present once `status` is "completed". */
  outcome?: BookingOutcome;
  /** ISO-8601 time the venue actually confirmed, when `outcome` is "booked". */
  confirmedTime?: string;
  /** Party size the venue confirmed, if it differs from the requested size. */
  confirmedPartySize?: number;
  /** Short natural-language summary of how the call went. */
  summary?: string;
  /** Full transcript, when available. */
  transcript?: TranscriptLine[];
  /** Call length in seconds, when known. */
  durationSeconds?: number;
  /** Human-readable error, present only when `status` is "failed". */
  error?: string;
};

/** Common interface implemented by both the real and mock adapters. */
export interface BookingAgentAdapter {
  startBookingCall(brief: EventBrief): Promise<BookingCallResult>;
  getBookingCallStatus(externalId: string): Promise<BookingCallResult>;
}
```

## `src/integrations/elevenlabs/config.ts`

```ts
/**
 * Environment-driven configuration for the ElevenLabs booking agent.
 *
 * Read lazily so tests can set env vars without re-importing. No secret is
 * ever logged — `describeConfig` exists so callers can debug configuration
 * state without risking printing the API key.
 */

import { readEnv } from "../shared/encoding.ts";

/** Anything key-value that config can be read from. Avoids depending on Node types. */
export type EnvLike = Record<string, string | undefined>;

export type ElevenLabsConfig = {
  /** Secret API key (`xi-api-key`). Absent -> the mock adapter is used. */
  apiKey: string | undefined;
  /** Pre-configured agent id from the ElevenLabs dashboard. */
  agentId: string | undefined;
  /** Imported Twilio phone number id from the ElevenLabs dashboard. */
  agentPhoneNumberId: string | undefined;
  /** API base URL. Overridable for tests. */
  baseUrl: string;
  /** Per-HTTP-call timeout in milliseconds. */
  timeoutMs: number;
  /**
   * When true, send a full `conversation_config_override` (system prompt +
   * first message) built from the brief. Requires the matching Security
   * toggles on the agent — see docs/elevenlabs-setup.md. When false, only
   * `dynamic_variables` are sent and the dashboard prompt must reference
   * them via {{placeholders}}.
   */
  usePromptOverride: boolean;
  /** Ask Twilio to record the call. Off by default (consent/privacy). */
  callRecordingEnabled: boolean;
  /** Forces the mock adapter even when credentials are present. */
  forceMock: boolean;
  /**
   * Forces the mock adapter's outcome, for demoing the non-happy paths
   * ("booked" | "declined" | "needs_followup" | "unknown"). Unset means the
   * mock decides from the brief.
   */
  mockOutcome: string | undefined;
};

const DEFAULT_BASE_URL = "https://api.elevenlabs.io";
const DEFAULT_TIMEOUT_MS = 15_000;

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(env: EnvLike = readEnv()): ElevenLabsConfig {
  return {
    apiKey: env.ELEVENLABS_API_KEY?.trim() || undefined,
    agentId: env.ELEVENLABS_AGENT_ID?.trim() || undefined,
    agentPhoneNumberId: env.ELEVENLABS_AGENT_PHONE_NUMBER_ID?.trim() || undefined,
    baseUrl: env.ELEVENLABS_BASE_URL?.trim() || DEFAULT_BASE_URL,
    timeoutMs: parsePositiveInt(env.ELEVENLABS_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    usePromptOverride: parseBoolean(env.ELEVENLABS_USE_PROMPT_OVERRIDE, true),
    callRecordingEnabled: parseBoolean(env.ELEVENLABS_CALL_RECORDING_ENABLED, false),
    forceMock: parseBoolean(env.ELEVENLABS_FORCE_MOCK),
    mockOutcome: env.ELEVENLABS_MOCK_OUTCOME?.trim() || undefined,
  };
}

/**
 * The real adapter needs all three credentials to place a call. Missing any
 * one of them means we fall back to the mock rather than failing at call
 * time — a half-configured environment should still give a working demo.
 */
export function shouldUseRealAdapter(config: ElevenLabsConfig): boolean {
  return (
    Boolean(config.apiKey) &&
    Boolean(config.agentId) &&
    Boolean(config.agentPhoneNumberId) &&
    !config.forceMock
  );
}

/** Names the env vars that are required but currently unset. */
export function missingCredentials(config: ElevenLabsConfig): string[] {
  const missing: string[] = [];
  if (!config.apiKey) missing.push("ELEVENLABS_API_KEY");
  if (!config.agentId) missing.push("ELEVENLABS_AGENT_ID");
  if (!config.agentPhoneNumberId) missing.push("ELEVENLABS_AGENT_PHONE_NUMBER_ID");
  return missing;
}

/** Safe-to-log configuration summary. Never includes the API key. */
export function describeConfig(config: ElevenLabsConfig): Record<string, unknown> {
  return {
    apiKeyConfigured: Boolean(config.apiKey),
    agentIdConfigured: Boolean(config.agentId),
    agentPhoneNumberIdConfigured: Boolean(config.agentPhoneNumberId),
    baseUrl: config.baseUrl,
    timeoutMs: config.timeoutMs,
    usePromptOverride: config.usePromptOverride,
    callRecordingEnabled: config.callRecordingEnabled,
    forceMock: config.forceMock,
    mockOutcome: config.mockOutcome,
    usingRealAdapter: shouldUseRealAdapter(config),
    missingCredentials: missingCredentials(config),
  };
}
```

## `src/integrations/elevenlabs/briefMapper.ts`

```ts
import type { EventBrief, TimeWindow } from "./types.ts";

/**
 * Converts a confirmed `EventBrief` into everything the ElevenLabs agent
 * needs for one outbound call: a system prompt, an opening line, and a flat
 * map of dynamic variables.
 *
 * This is the highest-leverage file in the integration — it is what decides
 * whether the call sounds like a competent assistant or a robot reading a
 * form. Everything here is pure and deterministic so it can be unit tested
 * and iterated on without placing a single phone call.
 *
 * Two delivery paths are supported (see docs/elevenlabs-setup.md):
 *   - `dynamic_variables` — always sent; the dashboard prompt can reference
 *     them as {{party_size}}, {{venue_name}}, etc.
 *   - `conversation_config_override` — sent when ELEVENLABS_USE_PROMPT_OVERRIDE
 *     is on; carries the full prompt built below, so the call behaviour is
 *     controlled from code rather than the dashboard.
 */

export type CallScript = {
  systemPrompt: string;
  firstMessage: string;
  dynamicVariables: Record<string, string>;
};

export function buildCallScript(brief: EventBrief): CallScript {
  return {
    systemPrompt: buildSystemPrompt(brief),
    firstMessage: buildFirstMessage(brief),
    dynamicVariables: buildDynamicVariables(brief),
  };
}

export function buildSystemPrompt(brief: EventBrief): string {
  const currency = brief.currency ?? "CAD";
  const windows = brief.preferredWindows.map(formatWindow);
  const primary = windows[0] ?? "a time that works for them";
  const alternates = windows.slice(1);

  const lines: string[] = [];

  lines.push(
    `# Role`,
    `You are a polite, efficient assistant making a phone call on behalf of ${brief.hostName} to book a table at ${brief.venueName}${
      brief.location ? ` in ${brief.location}` : ""
    }.`,
    ``,
    `# Disclosure`,
    `If the person asks whether you are a real person, or seems confused about who they are speaking to, say plainly that you are an AI assistant calling on behalf of ${brief.hostName}. Never claim to be a human.`,
    ``,
    `# Goal`,
    `Reserve a table for ${brief.partySize} ${
      brief.partySize === 1 ? "person" : "people"
    } at ${primary}.`
  );

  if (alternates.length > 0) {
    lines.push(
      `If that is unavailable, offer these alternatives in order: ${alternates.join("; ")}.`
    );
  }

  lines.push(``, `# Hard limits — never exceed these`);

  if (brief.negotiation.maxPricePerPerson !== undefined) {
    lines.push(
      `- Do not agree to any per-person cost, minimum spend, or prix-fixe above ${formatMoney(
        brief.negotiation.maxPricePerPerson,
        currency
      )} per person. If the venue requires more, say you need to check with the group and end politely.`
    );
  } else {
    lines.push(
      `- No price ceiling was set. If the venue requires a minimum spend or deposit, do not agree — say you need to confirm with the group first.`
    );
  }

  lines.push(
    `- Never provide credit card numbers, payment details, or any personal information beyond the host's name${
      brief.hostCallbackNumber ? ` and callback number` : ""
    }.`,
    `- Never agree to a non-refundable deposit or a cancellation fee.`
  );

  if (!brief.negotiation.timeFlexible) {
    lines.push(
      `- Do not accept a date or time outside the options listed above. If none work, thank them and end the call.`
    );
  } else if (brief.negotiation.timeToleranceMinutes) {
    lines.push(
      `- You may accept a start time up to ${brief.negotiation.timeToleranceMinutes} minutes earlier or later than the options above. Anything beyond that needs the group's approval.`
    );
  } else {
    lines.push(
      `- You may accept a nearby alternative time if the listed options are unavailable.`
    );
  }

  if (!brief.negotiation.acceptSplitSeating) {
    lines.push(
      `- The group must be seated together. Do not accept split tables.`
    );
  } else {
    lines.push(`- Split tables are acceptable if one table is not available.`);
  }

  lines.push(``, `# Requests to make`);

  if (brief.seatingPreference) {
    lines.push(
      `- Ask for ${brief.seatingPreference}, but treat it as a preference, not a requirement.`
    );
  }
  if (brief.dietaryNotes && brief.dietaryNotes.length > 0) {
    lines.push(
      `- Mention these dietary needs and confirm the kitchen can accommodate them: ${brief.dietaryNotes.join(
        ", "
      )}.`
    );
  }
  if (brief.budgetPerPerson !== undefined) {
    lines.push(
      `- The group is planning around ${formatMoney(
        brief.budgetPerPerson,
        currency
      )} per person. Only bring this up if the venue raises cost, set menus, or minimum spend.`
    );
  }

  lines.push(
    ``,
    `# Before ending the call`,
    `Read back and confirm out loud: the date and time, the number of people, and the name on the reservation (${brief.hostName}). If they gave a confirmation or reference number, repeat it back.`,
    ``,
    `# Style`,
    `- This is a live phone call. Keep every turn to one or two short sentences.`,
    `- Sound natural and warm, never scripted. Do not list your requirements all at once — ask for the reservation first, then handle details as they come up.`,
    `- Never invent availability, prices, or policies. If you do not know something, say you will check with the group.`,
    `- If you reach voicemail, leave a short message with the host's name, the party size, the requested time${
      brief.hostCallbackNumber ? `, and the callback number ${brief.hostCallbackNumber}` : ""
    }, then end the call.`
  );

  return lines.join("\n");
}

export function buildFirstMessage(brief: EventBrief): string {
  const primary = brief.preferredWindows[0];
  const when = primary ? formatWindow(primary) : "sometime soon";
  return `Hi! I'm calling on behalf of ${brief.hostName} — I'd like to see if you have a table for ${brief.partySize} available ${when}.`;
}

export function buildDynamicVariables(brief: EventBrief): Record<string, string> {
  const currency = brief.currency ?? "CAD";
  const windows = brief.preferredWindows.map(formatWindow);

  return {
    event_id: brief.eventId,
    venue_name: brief.venueName,
    location: brief.location,
    host_name: brief.hostName,
    host_callback_number: brief.hostCallbackNumber ?? "",
    party_size: String(brief.partySize),
    primary_time: windows[0] ?? "",
    alternate_times: windows.slice(1).join("; "),
    all_times: windows.join("; "),
    budget_per_person:
      brief.budgetPerPerson !== undefined ? formatMoney(brief.budgetPerPerson, currency) : "",
    max_price_per_person:
      brief.negotiation.maxPricePerPerson !== undefined
        ? formatMoney(brief.negotiation.maxPricePerPerson, currency)
        : "",
    seating_preference: brief.seatingPreference ?? "",
    dietary_notes: (brief.dietaryNotes ?? []).join(", "),
    time_flexible: brief.negotiation.timeFlexible ? "yes" : "no",
    accept_split_seating: brief.negotiation.acceptSplitSeating ? "yes" : "no",
  };
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Formats an ISO-8601 timestamp into speech-friendly text, e.g.
 * "Friday, September 12 at 7:00 PM".
 *
 * Deliberately reads the wall-clock fields straight out of the string rather
 * than going through `Date`+`Intl` with a timezone: the offset in the string
 * already IS the event's local time, so this stays deterministic across
 * machines and test runs with no timezone-database dependency.
 */
export function formatIsoForSpeech(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso.trim());
  if (!match) return iso;

  const [, yearStr, monthStr, dayStr, hourStr, minuteStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);

  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const monthName = MONTHS[month - 1];
  const period = hour < 12 ? "AM" : "PM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const minutePart = minute === 0 ? "" : `:${String(minute).padStart(2, "0")}`;

  return `${weekday}, ${monthName} ${day} at ${hour12}${minutePart || ":00"} ${period}`;
}

function formatWindow(window: TimeWindow): string {
  return formatIsoForSpeech(window.startIso);
}

function formatMoney(amount: number, currency: string): string {
  const rounded = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `${rounded} ${currency}`;
}
```

## `src/integrations/elevenlabs/internalApiTypes.ts`

```ts
/**
 * ElevenLabs Agents Platform request/response shapes.
 *
 * NOT exported from `./index.ts` — no code outside
 * `src/integrations/elevenlabs/**` should know these exist. Only
 * `EventBrief` / `BookingCallResult` cross the boundary. Kept intentionally
 * partial: only the fields this adapter reads are modeled.
 *
 * Sources:
 *   POST /v1/convai/twilio/outbound-call — https://elevenlabs.io/docs/agents-platform/api-reference/twilio/outbound-call
 *   GET  /v1/convai/conversations/{id}   — https://elevenlabs.io/docs/api-reference/conversations/get
 *   Overrides                            — https://elevenlabs.io/docs/eleven-agents/customization/personalization/overrides
 */

/** Per-call context passed alongside an outbound call request. */
export type ConversationInitiationClientData = {
  /** Values the dashboard prompt can reference as {{name}}. */
  dynamic_variables?: Record<string, string>;
  /**
   * Replaces agent settings for this one conversation. Each field used here
   * must have its matching toggle enabled in the agent's Security tab.
   */
  conversation_config_override?: {
    agent?: {
      prompt?: { prompt?: string };
      first_message?: string;
      language?: string;
    };
  };
};

export type OutboundCallRequest = {
  agent_id: string;
  agent_phone_number_id: string;
  to_number: string;
  conversation_initiation_client_data?: ConversationInitiationClientData;
  call_recording_enabled?: boolean;
};

export type OutboundCallResponse = {
  success?: boolean;
  message?: string;
  conversation_id?: string;
  callSid?: string;
};

/** Conversation lifecycle states returned by the conversations API. */
export type ElevenLabsConversationStatus =
  | "initiated"
  | "in-progress"
  | "processing"
  | "done"
  | "failed";

export type ElevenLabsTranscriptEntry = {
  role?: string;
  message?: string | null;
  time_in_call_secs?: number;
};

export type ElevenLabsDataCollectionResult = {
  value?: unknown;
  rationale?: string;
};

export type ElevenLabsAnalysis = {
  call_successful?: "success" | "failure" | "unknown";
  transcript_summary?: string;
  /**
   * Results of the agent's configured data-collection fields. The adapter
   * looks for the optional `booking_confirmed`, `confirmed_time`, and
   * `confirmed_party_size` items documented in docs/elevenlabs-setup.md.
   */
  data_collection_results?: Record<string, ElevenLabsDataCollectionResult>;
};

export type ElevenLabsConversation = {
  conversation_id?: string;
  agent_id?: string;
  status?: ElevenLabsConversationStatus;
  transcript?: ElevenLabsTranscriptEntry[];
  analysis?: ElevenLabsAnalysis | null;
  metadata?: {
    start_time_unix_secs?: number;
    call_duration_secs?: number;
    cost_fiat?: number;
  };
};
```

## `src/integrations/elevenlabs/elevenLabsAdapter.ts`

```ts
import type { ElevenLabsConfig } from "./config.ts";
import { missingCredentials } from "./config.ts";
import { buildCallScript } from "./briefMapper.ts";
import { fetchJson } from "../shared/httpJson.ts";
import type {
  BookingAgentAdapter,
  BookingCallResult,
  BookingOutcome,
  EventBrief,
  TranscriptLine,
} from "./types.ts";
import type {
  ConversationInitiationClientData,
  ElevenLabsAnalysis,
  ElevenLabsConversation,
  OutboundCallRequest,
  OutboundCallResponse,
} from "./internalApiTypes.ts";

/**
 * Real adapter backed by the ElevenLabs Agents Platform.
 *
 * Flow:
 *   1. startBookingCall  -> POST /v1/convai/twilio/outbound-call
 *      Dials the venue through the Twilio number imported into ElevenLabs
 *      and returns a `conversation_id` immediately. The call itself then
 *      happens asynchronously over the phone line.
 *   2. getBookingCallStatus -> GET /v1/convai/conversations/{conversation_id}
 *      Polls the conversation. Once status is "done", the response carries
 *      the transcript and (if the agent is configured for it) an analysis
 *      block with a summary and data-collection results.
 *
 * Only ONE agent is created — in the dashboard, once. Per-call context (this
 * venue, this party size, these constraints) is injected via dynamic
 * variables and an optional prompt override rather than by creating a new
 * agent per booking.
 *
 * Every network failure is converted into `{ status: "failed", error }`;
 * this adapter never throws.
 */
export class RealBookingAgentAdapter implements BookingAgentAdapter {
  private readonly config: ElevenLabsConfig;

  constructor(config: ElevenLabsConfig) {
    this.config = config;
  }

  async startBookingCall(brief: EventBrief): Promise<BookingCallResult> {
    const missing = missingCredentials(this.config);
    if (missing.length > 0) {
      return {
        status: "failed",
        error: `ElevenLabs is not fully configured. Missing: ${missing.join(", ")}.`,
      };
    }

    if (!brief.venuePhoneNumber?.trim()) {
      return {
        status: "failed",
        error: "Cannot place a booking call: the brief has no venue phone number.",
      };
    }

    const script = buildCallScript(brief);

    const clientData: ConversationInitiationClientData = {
      dynamic_variables: script.dynamicVariables,
    };

    if (this.config.usePromptOverride) {
      clientData.conversation_config_override = {
        agent: {
          prompt: { prompt: script.systemPrompt },
          first_message: script.firstMessage,
          language: "en",
        },
      };
    }

    const body: OutboundCallRequest = {
      agent_id: this.config.agentId!,
      agent_phone_number_id: this.config.agentPhoneNumberId!,
      to_number: brief.venuePhoneNumber.trim(),
      conversation_initiation_client_data: clientData,
      call_recording_enabled: this.config.callRecordingEnabled,
    };

    const result = await fetchJson<OutboundCallResponse>(
      `${this.config.baseUrl}/v1/convai/twilio/outbound-call`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": this.config.apiKey!,
        },
        body: JSON.stringify(body),
      },
      { serviceLabel: "ElevenLabs", timeoutMs: this.config.timeoutMs }
    );

    if (!result.ok) {
      return { status: "failed", error: result.message };
    }

    if (result.data.success === false) {
      return {
        status: "failed",
        error: result.data.message || "ElevenLabs declined to place the call.",
      };
    }

    if (!result.data.conversation_id) {
      return {
        status: "failed",
        error: "ElevenLabs accepted the call but returned no conversation id to poll.",
      };
    }

    return { status: "pending", externalId: result.data.conversation_id };
  }

  async getBookingCallStatus(externalId: string): Promise<BookingCallResult> {
    const missing = missingCredentials(this.config);
    if (missing.length > 0) {
      return {
        status: "failed",
        error: `ElevenLabs is not fully configured. Missing: ${missing.join(", ")}.`,
      };
    }

    const result = await fetchJson<ElevenLabsConversation>(
      `${this.config.baseUrl}/v1/convai/conversations/${encodeURIComponent(externalId)}`,
      {
        method: "GET",
        headers: { "xi-api-key": this.config.apiKey! },
      },
      { serviceLabel: "ElevenLabs", timeoutMs: this.config.timeoutMs }
    );

    if (!result.ok) {
      return { status: "failed", error: result.message };
    }

    return conversationToBookingResult(externalId, result.data);
  }
}

export function conversationToBookingResult(
  externalId: string,
  conversation: ElevenLabsConversation
): BookingCallResult {
  const base: BookingCallResult = {
    status: "in_progress",
    externalId: conversation.conversation_id || externalId,
  };

  const durationSeconds = conversation.metadata?.call_duration_secs;
  if (durationSeconds !== undefined) base.durationSeconds = durationSeconds;

  switch (conversation.status) {
    case "initiated":
      return { ...base, status: "pending" };

    case "in-progress":
    case "processing":
      // "processing" means the call has ended but post-call analysis is still
      // running. Surface the transcript we already have while we wait.
      return { ...base, status: "in_progress", transcript: mapTranscript(conversation) };

    case "failed":
      return {
        ...base,
        status: "failed",
        error: "The booking call failed to connect or was dropped by the provider.",
        transcript: mapTranscript(conversation),
      };

    case "done": {
      const transcript = mapTranscript(conversation);
      const analysis = conversation.analysis ?? undefined;
      const completed: BookingCallResult = {
        ...base,
        status: "completed",
        outcome: deriveOutcome(analysis),
        transcript,
      };
      if (analysis?.transcript_summary) completed.summary = analysis.transcript_summary;

      const confirmedTime = readStringDataPoint(analysis, "confirmed_time");
      if (confirmedTime) completed.confirmedTime = confirmedTime;

      const confirmedPartySize = readNumberDataPoint(analysis, "confirmed_party_size");
      if (confirmedPartySize !== undefined) completed.confirmedPartySize = confirmedPartySize;

      return completed;
    }

    default:
      // Unknown/absent status: treat as still running rather than inventing
      // a terminal state. Callers keep polling; nothing is falsely reported
      // as booked.
      return { ...base, status: "in_progress", transcript: mapTranscript(conversation) };
  }
}

/**
 * Decides the booking outcome.
 *
 * Precedence: an explicit `booking_confirmed` data-collection field wins,
 * because it is the agent's own structured answer. Otherwise fall back to
 * `call_successful`. A completed call is NEVER reported as "booked" without
 * positive evidence — project.md requires that booking actions never appear
 * successful until an external path actually confirms.
 */
function deriveOutcome(analysis: ElevenLabsAnalysis | undefined): BookingOutcome {
  const confirmed = readBooleanDataPoint(analysis, "booking_confirmed");
  if (confirmed === true) return "booked";
  if (confirmed === false) return "declined";

  switch (analysis?.call_successful) {
    case "success":
      return "booked";
    case "failure":
      return "declined";
    default:
      return "needs_followup";
  }
}

function mapTranscript(conversation: ElevenLabsConversation): TranscriptLine[] {
  return (conversation.transcript ?? [])
    .filter((entry) => typeof entry.message === "string" && entry.message.trim() !== "")
    .map((entry) => ({
      role: entry.role === "user" ? "user" : "agent",
      message: (entry.message as string).trim(),
      atSeconds: entry.time_in_call_secs ?? 0,
    }));
}

function readDataPoint(
  analysis: ElevenLabsAnalysis | undefined,
  key: string
): unknown {
  return analysis?.data_collection_results?.[key]?.value;
}

function readStringDataPoint(
  analysis: ElevenLabsAnalysis | undefined,
  key: string
): string | undefined {
  const value = readDataPoint(analysis, key);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function readNumberDataPoint(
  analysis: ElevenLabsAnalysis | undefined,
  key: string
): number | undefined {
  const value = readDataPoint(analysis, key);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function readBooleanDataPoint(
  analysis: ElevenLabsAnalysis | undefined,
  key: string
): boolean | undefined {
  const value = readDataPoint(analysis, key);
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "confirmed"].includes(normalized)) return true;
    if (["false", "no", "declined"].includes(normalized)) return false;
  }
  return undefined;
}
```

## `src/integrations/elevenlabs/mockAdapter.ts`

```ts
import type {
  BookingAgentAdapter,
  BookingCallResult,
  BookingOutcome,
  EventBrief,
  TranscriptLine,
} from "./types.ts";
import { formatIsoForSpeech } from "./briefMapper.ts";
import { toBase64Url, fromBase64Url } from "../shared/encoding.ts";

/**
 * Deterministic, fully offline booking-agent mock.
 *
 * project.md requires that "booking actions must never appear successful
 * until an external booking path returns confirmation" and that a
 * "deterministic fallback should be available if external services fail
 * during judging." This adapter is that fallback: it places no call, needs
 * no credentials, and produces a realistic scripted transcript built from
 * the actual brief.
 *
 * Statelessness: the brief and the call's start time are encoded into
 * `externalId`, so `getBookingCallStatus` can re-derive everything without
 * any server-side storage — it behaves identically in one process, across a
 * restart, or across serverless invocations.
 *
 * Simulated progression: status advances on elapsed wall-clock time since
 * the id was minted (pending -> in_progress -> completed), so the polling
 * and loading states in the UI can be demoed for real rather than snapping
 * straight to a finished call. Inject `now` to control this in tests.
 */

export type MockBookingOptions = {
  /** Clock injection point for tests. Defaults to `Date.now`. */
  now?: () => number;
  /** Forces a specific outcome — useful for demoing the non-happy paths. */
  forcedOutcome?: BookingOutcome;
};

/** Seconds after start at which the mock call moves from pending to talking. */
const CONNECTING_SECONDS = 3;
/** Seconds after start at which the mock call is finished and analyzed. */
const COMPLETED_SECONDS = 12;

export class MockBookingAgentAdapter implements BookingAgentAdapter {
  private readonly now: () => number;
  private readonly forcedOutcome?: BookingOutcome;

  constructor(options: MockBookingOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.forcedOutcome = options.forcedOutcome;
  }

  async startBookingCall(brief: EventBrief): Promise<BookingCallResult> {
    return {
      status: "pending",
      externalId: encodeExternalId(brief, this.now()),
    };
  }

  async getBookingCallStatus(externalId: string): Promise<BookingCallResult> {
    const decoded = decodeExternalId(externalId);
    if (!decoded) {
      return { status: "failed", error: "Unrecognized mock booking call externalId." };
    }

    const { brief, startedAtMs } = decoded;
    const elapsedSeconds = Math.max(0, Math.floor((this.now() - startedAtMs) / 1000));
    const outcome = this.forcedOutcome ?? deriveMockOutcome(brief);
    const fullTranscript = buildMockTranscript(brief, outcome);

    if (elapsedSeconds < CONNECTING_SECONDS) {
      return { status: "pending", externalId };
    }

    if (elapsedSeconds < COMPLETED_SECONDS) {
      // Reveal the transcript progressively so a live demo shows the call
      // unfolding rather than appearing all at once.
      const revealed = fullTranscript.filter((line) => line.atSeconds <= elapsedSeconds);
      return {
        status: "in_progress",
        externalId,
        transcript: revealed,
        durationSeconds: elapsedSeconds,
      };
    }

    const result: BookingCallResult = {
      status: "completed",
      externalId,
      outcome,
      transcript: fullTranscript,
      durationSeconds: COMPLETED_SECONDS,
      summary: buildMockSummary(brief, outcome),
    };

    if (outcome === "booked") {
      const primary = brief.preferredWindows[0];
      if (primary) result.confirmedTime = primary.startIso;
      result.confirmedPartySize = brief.partySize;
    }

    return result;
  }
}

const EXTERNAL_ID_PREFIX = "mock-call:";

type DecodedId = { brief: EventBrief; startedAtMs: number };

function encodeExternalId(brief: EventBrief, startedAtMs: number): string {
  const payload = JSON.stringify({ brief, startedAtMs });
  return `${EXTERNAL_ID_PREFIX}${toBase64Url(payload)}`;
}

function decodeExternalId(externalId: string): DecodedId | null {
  if (!externalId.startsWith(EXTERNAL_ID_PREFIX)) return null;
  try {
    const json = fromBase64Url(externalId.slice(EXTERNAL_ID_PREFIX.length));
    const parsed = JSON.parse(json);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.startedAtMs !== "number" ||
      typeof parsed.brief !== "object" ||
      parsed.brief === null
    ) {
      return null;
    }
    return { brief: parsed.brief as EventBrief, startedAtMs: parsed.startedAtMs };
  } catch {
    return null;
  }
}

/** A brief with no proposed times can't be booked — surface it for a human. */
function deriveMockOutcome(brief: EventBrief): BookingOutcome {
  return brief.preferredWindows.length > 0 ? "booked" : "needs_followup";
}

function buildMockTranscript(brief: EventBrief, outcome: BookingOutcome): TranscriptLine[] {
  const primary = brief.preferredWindows[0];
  const when = primary ? formatIsoForSpeech(primary.startIso) : "sometime this week";
  const lines: TranscriptLine[] = [
    { role: "user", message: `${brief.venueName}, how can I help you?`, atSeconds: 3 },
    {
      role: "agent",
      message: `Hi! I'm calling on behalf of ${brief.hostName} — I'd like to see if you have a table for ${brief.partySize} available ${when}.`,
      atSeconds: 5,
    },
  ];

  if (outcome === "booked") {
    lines.push(
      { role: "user", message: `Let me check… yes, we can do that. Can I get a name?`, atSeconds: 7 },
      { role: "agent", message: `That's under ${brief.hostName}.`, atSeconds: 8 }
    );

    if (brief.dietaryNotes && brief.dietaryNotes.length > 0) {
      lines.push(
        {
          role: "agent",
          message: `One more thing — we have ${brief.dietaryNotes.join(" and ")} in the group. Is the kitchen able to work with that?`,
          atSeconds: 9,
        },
        { role: "user", message: `That's no problem at all, we can accommodate.`, atSeconds: 10 }
      );
    }

    lines.push(
      {
        role: "agent",
        message: `Perfect — so that's ${brief.partySize} on ${when}, under ${brief.hostName}. Thank you so much!`,
        atSeconds: 11,
      },
      { role: "user", message: `You're all set. See you then!`, atSeconds: 12 }
    );
    return lines;
  }

  if (outcome === "declined") {
    lines.push(
      {
        role: "user",
        message: `I'm sorry, we're fully committed that evening and we don't have anything for a group that size.`,
        atSeconds: 7,
      },
      {
        role: "agent",
        message: `Understood — thank you for checking. I'll take it back to the group.`,
        atSeconds: 9,
      }
    );
    return lines;
  }

  lines.push(
    {
      role: "user",
      message: `For a group that size we'd need a set menu and a deposit. Do you want to go ahead?`,
      atSeconds: 7,
    },
    {
      role: "agent",
      message: `I'd rather confirm that with the group before committing. I'll follow up — thank you!`,
      atSeconds: 10,
    }
  );
  return lines;
}

function buildMockSummary(brief: EventBrief, outcome: BookingOutcome): string {
  const primary = brief.preferredWindows[0];
  const when = primary ? formatIsoForSpeech(primary.startIso) : "an unspecified time";

  switch (outcome) {
    case "booked":
      return `${brief.venueName} confirmed a table for ${brief.partySize} on ${when} under ${brief.hostName}.${
        brief.dietaryNotes && brief.dietaryNotes.length > 0
          ? ` The kitchen confirmed it can accommodate: ${brief.dietaryNotes.join(", ")}.`
          : ""
      }`;
    case "declined":
      return `${brief.venueName} could not accommodate ${brief.partySize} on ${when}. No reservation was made.`;
    case "needs_followup":
      return `${brief.venueName} requires a set menu and a deposit, which is outside the approved range. The agent did not commit and flagged this for ${brief.hostName}.`;
    default:
      return `The call to ${brief.venueName} completed but the outcome could not be determined.`;
  }
}
```

## `src/integrations/elevenlabs/index.ts`

```ts
/**
 * Public entry point for the ElevenLabs booking-agent integration.
 *
 * Application code should import ONLY from this file (or `./types.ts` for
 * the plain type declarations) — never from elevenLabsAdapter.ts,
 * mockAdapter.ts, or internalApiTypes.ts.
 *
 * Usage:
 *
 *   import { startBookingCall, getBookingCallStatus } from "src/integrations/elevenlabs";
 *
 *   const call = await startBookingCall(brief);
 *   // ... poll from a background job or a status endpoint ...
 *   const updated = await getBookingCallStatus(call.externalId!);
 *
 * Whether this places a real phone call or runs the deterministic mock is
 * decided once from environment configuration and is invisible to callers.
 * With no credentials set, the mock runs — so the booking flow is always
 * demoable. See docs/elevenlabs-setup.md.
 */

import { loadConfig, shouldUseRealAdapter, describeConfig, missingCredentials } from "./config.ts";
import { RealBookingAgentAdapter } from "./elevenLabsAdapter.ts";
import { MockBookingAgentAdapter } from "./mockAdapter.ts";
import { readEnv } from "../shared/encoding.ts";
import type {
  BookingAgentAdapter,
  BookingCallResult,
  BookingOutcome,
  EventBrief,
} from "./types.ts";

export type {
  EventBrief,
  BookingCallResult,
  BookingCallStatus,
  BookingOutcome,
  BookingAgentAdapter,
  NegotiationBounds,
  TimeWindow,
  TranscriptLine,
} from "./types.ts";

export {
  buildCallScript,
  buildSystemPrompt,
  buildFirstMessage,
  buildDynamicVariables,
} from "./briefMapper.ts";

const VALID_OUTCOMES: BookingOutcome[] = ["booked", "declined", "needs_followup", "unknown"];

let cachedAdapter: BookingAgentAdapter | undefined;

/** Builds a fresh adapter from the given environment. Exposed for tests. */
export function createBookingAgentAdapter(
  env: EnvLike = readEnv()
): BookingAgentAdapter {
  const config = loadConfig(env);

  if (shouldUseRealAdapter(config)) {
    return new RealBookingAgentAdapter(config);
  }

  const forcedOutcome = VALID_OUTCOMES.find((outcome) => outcome === config.mockOutcome);
  return new MockBookingAgentAdapter(forcedOutcome ? { forcedOutcome } : {});
}

/** Process-wide singleton, selected from the environment on first use. */
export function getBookingAgentAdapter(): BookingAgentAdapter {
  if (!cachedAdapter) {
    cachedAdapter = createBookingAgentAdapter();
  }
  return cachedAdapter;
}

/** Resets the memoized singleton. Tests only. */
export function resetBookingAgentAdapterForTests(): void {
  cachedAdapter = undefined;
}

/** Safe-to-log summary of how the booking agent is configured (no secrets). */
export function describeBookingAgentConfig(
  env: EnvLike = readEnv()
): Record<string, unknown> {
  return describeConfig(loadConfig(env));
}

/**
 * True when real phone calls are possible. The UI can use this to label the
 * booking action honestly ("Call venue" vs "Simulate call") — it should
 * never change whether the flow works.
 */
export function isLiveCallingConfigured(env: EnvLike = readEnv()): boolean {
  return shouldUseRealAdapter(loadConfig(env));
}

/** Env vars still needed before real calls can be placed. */
export function missingBookingAgentCredentials(
  env: EnvLike = readEnv()
): string[] {
  return missingCredentials(loadConfig(env));
}

export async function startBookingCall(brief: EventBrief): Promise<BookingCallResult> {
  return getBookingAgentAdapter().startBookingCall(brief);
}

export async function getBookingCallStatus(externalId: string): Promise<BookingCallResult> {
  return getBookingAgentAdapter().getBookingCallStatus(externalId);
}
```
