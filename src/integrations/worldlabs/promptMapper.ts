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
