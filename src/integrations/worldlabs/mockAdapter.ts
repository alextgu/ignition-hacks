import { createHash } from "node:crypto";
import type { WorldSeed, WorldResult, WorldLabsAdapter } from "./types.ts";

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
  return `${EXTERNAL_ID_PREFIX}${Buffer.from(JSON.stringify(seed), "utf8").toString("base64url")}`;
}

function decodeExternalId(externalId: string): WorldSeed | null {
  if (!externalId.startsWith(EXTERNAL_ID_PREFIX)) return null;
  try {
    const json = Buffer.from(
      externalId.slice(EXTERNAL_ID_PREFIX.length),
      "base64url"
    ).toString("utf8");
    const parsed = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as WorldSeed;
  } catch {
    return null;
  }
}

function buildMockResult(seed: WorldSeed): WorldResult {
  const hash = createHash("sha256").update(JSON.stringify(seed)).digest("hex");
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

  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
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

  return `data:text/html;base64,${Buffer.from(html, "utf8").toString("base64")}`;
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
