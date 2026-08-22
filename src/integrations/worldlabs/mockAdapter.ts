import type { WorldSeed, WorldResult, WorldLabsAdapter } from "./types.ts";
import { toBase64, toBase64Url, fromBase64Url } from "../shared/encoding.ts";
import { planetSvg, planetHtml } from "./planet.ts";

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
  return {
    status: "ready",
    externalId: encodeExternalId(seed),
    embedUrl: `data:text/html;base64,${toBase64(planetHtml(seed))}`,
    previewImageUrl: `data:image/svg+xml;base64,${toBase64(
      planetSvg(seed, { width: 640, height: 360 })
    )}`,
  };
}
