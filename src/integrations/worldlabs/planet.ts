import { stableHash } from "../shared/encoding.ts";
import type { WorldSeed } from "./types.ts";

/**
 * Renders a Plan-it: a small planet, generated deterministically from a
 * WorldSeed.
 *
 * This is the fallback shown while a real World Labs scene is still
 * generating, or in place of one when no API key is configured. It is
 * deliberately not a grey placeholder box — the product is called Plan-it,
 * every event is "a planet", and each guest who joins becomes a light on its
 * night side. The fallback is meant to be the thing you'd happily leave on
 * screen.
 *
 * Pure and deterministic: identical seeds produce a byte-identical SVG, with
 * no randomness, no clock, no dependencies, and nothing fetched. It renders
 * anywhere an <img> or an <iframe> does.
 */

/** Deterministic PRNG (mulberry32) seeded from the hash. */
function rng(seedHex: string): () => number {
  let a = Number.parseInt(seedHex.slice(0, 8), 16) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Palette = {
  name: string;
  /** Darkest ocean / shadow side. */
  deep: string;
  /** Mid ocean tone. */
  mid: string;
  /** Lit limb tone. */
  light: string;
  /** Two landmass tones, always within the same family. */
  land: [string, string];
  /** Atmosphere rim and guest lights. */
  glow: string;
};

/**
 * Hand-picked worlds rather than raw hue arithmetic.
 *
 * Deriving a hue mathematically produced planets that were all the same
 * muddy green, with landmass tones that clashed against the ocean. A small
 * curated set guarantees every planet is a colour combination someone chose,
 * and guarantees real variety between events.
 */
const PALETTES: Palette[] = [
  {
    name: "ocean",
    deep: "#06192e", mid: "#0f3f6b", light: "#5fa8d8",
    land: ["#2e6b52", "#4f8f63"], glow: "#8ecbff",
  },
  {
    name: "rust",
    deep: "#2a0d08", mid: "#6e2a15", light: "#d98452",
    land: ["#8a4423", "#b56a38"], glow: "#ffb27a",
  },
  {
    name: "jade",
    deep: "#04211c", mid: "#0d4a3d", light: "#4fb597",
    land: ["#1f6b4a", "#3f9268"], glow: "#7ff0c8",
  },
  {
    name: "amber",
    deep: "#2b1a04", mid: "#6d4310", light: "#dda344",
    land: ["#8a5c18", "#b8862f"], glow: "#ffd27a",
  },
  {
    name: "violet",
    deep: "#170a2e", mid: "#3b1f6b", light: "#9070d8",
    land: ["#4d2c7a", "#6b46a3"], glow: "#c4a8ff",
  },
  {
    name: "ice",
    deep: "#0a1c24", mid: "#1d4a58", light: "#7fc3d4",
    land: ["#325f66", "#4f858c"], glow: "#b8ecf7",
  },
  {
    name: "ember",
    deep: "#2b0713", mid: "#701229", light: "#d8546f",
    land: ["#8a2038", "#b34355"], glow: "#ff9db0",
  },
  {
    name: "moss",
    deep: "#141f06", mid: "#3b5210", light: "#93b048",
    land: ["#4d6b18", "#6e8c2c"], glow: "#d2eb8a",
  },
];

function palette(hash: string): Palette {
  const index = Number.parseInt(hash.slice(4, 8), 16) % PALETTES.length;
  return PALETTES[index];
}

export type PlanetOptions = {
  /** Number of guest lights to place on the night side. */
  guests?: number;
  /** Include CSS animation (rotation, twinkle). Off for static thumbnails. */
  animate?: boolean;
  width?: number;
  height?: number;
};

export function planetSvg(seed: WorldSeed, options: PlanetOptions = {}): string {
  const width = options.width ?? 640;
  const height = options.height ?? 360;
  const animate = options.animate ?? false;
  const guests = clampGuests(options.guests ?? seed.groupSize);

  const hash = stableHash(JSON.stringify(seed));
  const rand = rng(hash);
  const p = palette(hash);

  const cx = width * 0.5;
  const cy = height * 0.52;
  const r = Math.min(width, height) * 0.32;

  // Light comes from the upper-left, so the terminator and the rim highlight
  // both key off the same direction.
  const lx = cx - r * 0.42;
  const ly = cy - r * 0.46;

  const stars = buildStars(rand, width, height, 140);
  const landmasses = buildLandmasses(rand, cx, cy, r, p);
  const lights = buildGuestLights(rand, cx, cy, r, guests, p);

  const css = animate
    ? `<style>
      @keyframes planit-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @keyframes planit-twinkle { 0%,100% { opacity:.25 } 50% { opacity:.85 } }
      .surface { animation: planit-spin 180s linear infinite; transform-origin: ${cx}px ${cy}px; }
      .stars circle { animation: planit-twinkle 7s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) { .surface, .stars circle { animation: none; } }
    </style>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(
    ariaLabel(seed, guests)
  )}">
  <defs>
    <radialGradient id="space" cx="42%" cy="38%" r="80%">
      <stop offset="0%" stop-color="${p.deep}" stop-opacity=".55"/>
      <stop offset="100%" stop-color="#050506"/>
    </radialGradient>

    <radialGradient id="globe" gradientUnits="userSpaceOnUse"
      cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="${(r * 1.85).toFixed(1)}">
      <stop offset="0%" stop-color="${p.light}"/>
      <stop offset="34%" stop-color="${p.mid}"/>
      <stop offset="72%" stop-color="${p.deep}"/>
      <stop offset="100%" stop-color="#000"/>
    </radialGradient>

    <!-- Night side. Strong, so the guest lights actually read as lights. -->
    <radialGradient id="night" gradientUnits="userSpaceOnUse"
      cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="${(r * 2.0).toFixed(1)}">
      <stop offset="38%" stop-color="#000" stop-opacity="0"/>
      <stop offset="72%" stop-color="#000" stop-opacity=".45"/>
      <stop offset="100%" stop-color="#000" stop-opacity=".92"/>
    </radialGradient>

    <!-- Thin crescent of atmosphere on the lit limb only. -->
    <radialGradient id="rim" gradientUnits="userSpaceOnUse"
      cx="${cx}" cy="${cy}" r="${r.toFixed(1)}">
      <stop offset="91%" stop-color="${p.glow}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${p.glow}" stop-opacity="1"/>
    </radialGradient>
    <linearGradient id="rimMaskGrad" gradientUnits="userSpaceOnUse"
      x1="${(cx - r).toFixed(1)}" y1="${(cy - r).toFixed(1)}"
      x2="${(cx + r).toFixed(1)}" y2="${(cy + r).toFixed(1)}">
      <stop offset="0%" stop-color="#fff"/>
      <stop offset="55%" stop-color="#000"/>
    </linearGradient>
    <mask id="rimMask">
      <rect width="${width}" height="${height}" fill="url(#rimMaskGrad)"/>
    </mask>

    <!-- Soft outer glow, kept faint so it reads as air, not a ring. -->
    <radialGradient id="air" gradientUnits="userSpaceOnUse"
      cx="${cx}" cy="${cy}" r="${(r * 1.3).toFixed(1)}">
      <stop offset="76%" stop-color="${p.glow}" stop-opacity=".2"/>
      <stop offset="100%" stop-color="${p.glow}" stop-opacity="0"/>
    </radialGradient>

    <clipPath id="globeClip"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
    <filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="${(r * 0.035).toFixed(2)}"/>
    </filter>
    <filter id="glow" x="-400%" y="-400%" width="900%" height="900%">
      <feGaussianBlur stdDeviation="${(r * 0.018).toFixed(2)}"/>
    </filter>
  </defs>
  ${css}

  <rect width="${width}" height="${height}" fill="url(#space)"/>
  <g class="stars">${stars}</g>

  <circle cx="${cx}" cy="${cy}" r="${(r * 1.3).toFixed(1)}" fill="url(#air)"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#globe)"/>

  <g clip-path="url(#globeClip)">
    <g class="surface" filter="url(#soft)">${landmasses}</g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#night)"/>
    <g filter="url(#glow)">${lights}</g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#rim)" mask="url(#rimMask)"/>
  </g>
</svg>`;
}

/** A full standalone page for the embed slot. */
export function planetHtml(seed: WorldSeed, guests?: number): string {
  const svg = planetSvg(seed, { guests, animate: true, width: 1280, height: 720 });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeXml(titleFor(seed))}</title>
<style>
  html,body{margin:0;height:100%;background:#080706;overflow:hidden}
  .stage{height:100%;display:grid;place-items:center}
  svg{width:100%;height:100%;display:block;object-fit:cover}
  .tag{
    position:fixed;left:50%;bottom:18px;transform:translateX(-50%);
    font:500 13px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.02em;
    color:#FAFAF9;background:rgba(12,10,9,.62);border:1.5px solid #2E2A27;
    padding:8px 14px;border-radius:999px;white-space:nowrap;
  }
</style>
</head>
<body>
  <div class="stage">${svg}</div>
  <div class="tag">${escapeXml(titleFor(seed))}</div>
</body>
</html>`;
}

function buildStars(rand: () => number, w: number, h: number, count: number): string {
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = (rand() * w).toFixed(1);
    const y = (rand() * h).toFixed(1);
    const rr = (0.35 + rand() * 1.05).toFixed(2);
    const o = (0.2 + rand() * 0.7).toFixed(2);
    const delay = (rand() * 6).toFixed(1);
    out.push(
      `<circle cx="${x}" cy="${y}" r="${rr}" fill="#fff" opacity="${o}" style="animation-delay:${delay}s"/>`
    );
  }
  return out.join("");
}

function buildLandmasses(
  rand: () => number,
  cx: number,
  cy: number,
  r: number,
  p: Palette
): string {
  const out: string[] = [];
  const count = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < count; i += 1) {
    const angle = rand() * Math.PI * 2;
    // sqrt keeps placement even across the disc instead of clumping centrally.
    const dist = Math.sqrt(rand()) * r * 0.66;
    const x = cx + Math.cos(angle) * dist;
    const y = cy + Math.sin(angle) * dist * 0.9;
    const rx = r * (0.2 + rand() * 0.26);
    const ry = rx * (0.44 + rand() * 0.42);
    const rot = Math.floor(rand() * 180);
    const fill = p.land[rand() > 0.5 ? 1 : 0];
    const op = (0.5 + rand() * 0.3).toFixed(2);
    out.push(
      `<ellipse rx="${rx.toFixed(1)}" ry="${ry.toFixed(
        1
      )}" fill="${fill}" opacity="${op}" transform="translate(${x.toFixed(
        1
      )} ${y.toFixed(1)}) rotate(${rot})"/>`
    );
  }
  return out.join("");
}

function buildGuestLights(
  rand: () => number,
  cx: number,
  cy: number,
  r: number,
  guests: number,
  p: Palette
): string {
  const out: string[] = [];
  for (let i = 0; i < guests; i += 1) {
    // Lower-right quadrant, which the night gradient holds in shadow, so
    // each guest reads as a lit settlement rather than a dot on daylight.
    const angle = -Math.PI * 0.08 + rand() * Math.PI * 0.56;
    const dist = r * (0.3 + Math.sqrt(rand()) * 0.6);
    const x = cx + Math.cos(angle) * dist;
    const y = cy + Math.sin(angle) * dist * 0.92;
    const rr = (r * 0.014 + rand() * r * 0.012).toFixed(2);
    out.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(
        1
      )}" r="${rr}" fill="${p.glow}"/>`
    );
  }
  return out.join("");
}

function clampGuests(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 4;
  return Math.min(Math.round(n), 40);
}

function titleFor(seed: WorldSeed): string {
  const type = (seed.eventType || "Event").trim();
  const loc = (seed.location || "").trim();
  const label = loc ? `${capitalize(type)} · ${loc}` : capitalize(type);
  return label.length > 70 ? `${label.slice(0, 69)}…` : label;
}

function ariaLabel(seed: WorldSeed, guests: number): string {
  return `A small planet representing ${seed.eventType || "this event"}${
    seed.location ? ` in ${seed.location}` : ""
  }, with ${guests} ${guests === 1 ? "light" : "lights"} on its night side.`;
}

function capitalize(v: string): string {
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : v;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (ch) => {
    switch (ch) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}
