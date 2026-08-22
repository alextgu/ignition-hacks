import type { WorldSeed } from "./types.ts";

/**
 * Converts an approved WorldSeed into a World Labs `text_prompt`.
 *
 * The seed's fields are the kind of words people use on a form — "cozy",
 * "mid-range", "golden hour". Marble cannot render any of those directly.
 * Its own guidance asks for a specific location described with concrete,
 * spatial, sensory detail, and warns against abstract emotions, narrative
 * description, and 2D painting language. The community prompt guide
 * distills the structure that works as:
 *
 *   [architecture / space] + [materials] + [lighting & time] + [scale] +
 *   [colour palette] + [boundaries]
 *
 * So the job of this file is translation: each vague form answer is mapped
 * onto renderable physical language before the prompt is assembled in that
 * order. "cozy" becomes low warm pools of lamplight and deep corner
 * shadows; "mid-range" becomes oak, tile and brass. That mapping is the
 * difference between a generic room and a room worth looking at.
 *
 * Two deliberate choices worth knowing:
 *
 *  - **The room is asked for empty.** Marble does not generate human
 *    figures, and the product layers guest markers over the scene anyway,
 *    so the prompt asks for set-but-unoccupied places. Asking for people
 *    would waste the request and produce artefacts.
 *  - **Everything is pure and deterministic**, so the prompt can be unit
 *    tested and iterated without spending a generation credit.
 *
 * Sources: https://docs.worldlabs.ai/marble/create/prompt-guides/
 */

/** Marble's documented hard cap on `text_prompt`. */
const MAX_PROMPT_CHARS = 2000;

type Phrase = { match: string[]; text: string };

/** Returns undefined when nothing matches, so callers can chain fallbacks. */
function tryPick(phrases: Phrase[], value: string): string | undefined {
  const needle = clean(value).toLowerCase();
  if (!needle) return undefined;
  for (const phrase of phrases) {
    if (phrase.match.some((m) => needle.includes(m))) return phrase.text;
  }
  return undefined;
}

/** Falls back to the first entry when nothing matches. */
function pick(phrases: Phrase[], value: string): string {
  return tryPick(phrases, value) ?? phrases[0].text;
}

/** Event type -> the kind of room it happens in. */
const SPACES: Phrase[] = [
  {
    match: ["dinner", "birthday", "anniversary", "celebration", "date"],
    text: "an intimate restaurant dining room with a low ceiling and a long shared table",
  },
  {
    match: ["party", "night out", "cocktail", "housewarming"],
    text: "an open loft event space with tall windows, a bar along one wall and clustered standing tables",
  },
  {
    match: ["corporate", "offsite", "meeting", "networking", "mixer", "work"],
    text: "a private event room with a boardroom-length table, panelled walls and a serving credenza",
  },
  {
    match: ["brunch", "coffee", "cafe", "lunch"],
    text: "a bright corner cafe with small marble-topped tables and bentwood chairs",
  },
  {
    match: ["hangout", "casual", "chill", "catch up", "meetup"],
    text: "a relaxed neighbourhood bistro with worn banquette seating and a scuffed wooden bar",
  },
  {
    match: ["picnic", "park", "outdoor", "patio", "rooftop", "garden"],
    text: "a sheltered rooftop terrace with planters, string lights overhead and a city skyline beyond the railing",
  },
];

/** Mood -> light behaviour and shadow, never the emotion word itself. */
const MOODS: Phrase[] = [
  {
    match: ["cozy", "cosy", "warm", "intimate", "relaxed", "comfortable"],
    text: "Low warm pools of light from table lamps and candles, deep soft shadows in the corners, the far end of the room falling into darkness",
  },
  {
    match: ["energetic", "lively", "fun", "loud", "festive", "celebratory"],
    text: "Bright even light with warm spill from pendant fixtures, a few saturated colour washes across the back wall, no deep shadow",
  },
  {
    match: ["elegant", "formal", "refined", "upscale", "classy", "fancy"],
    text: "Restrained warm downlights picking out the table settings, soft highlights on glass and metal, the walls held in gentle shadow",
  },
  {
    match: ["quiet", "calm", "peaceful", "low key", "mellow"],
    text: "Even diffuse daylight with almost no hard shadow, light falling softly across the floor",
  },
  {
    match: ["rustic", "homey", "old", "vintage", "traditional"],
    text: "Warm uneven light from mismatched fixtures, visible dust in the beams, shadows pooling under the furniture",
  },
];

/** Price character -> actual materials and surfaces. */
const MATERIALS: Phrase[] = [
  {
    match: ["mid", "moderate", "reasonable", "standard", "middle"],
    text: "Solid oak tables, patterned tile floor, plaster walls, brass fixtures and simple stoneware",
  },
  {
    match: ["budget", "cheap", "affordable", "casual", "low", "inexpensive"],
    text: "Scuffed pine tabletops, painted brick, vinyl bench seating, exposed conduit overhead and mismatched glassware",
  },
  {
    match: ["splurge", "expensive", "premium", "luxury", "high", "upscale", "fine"],
    text: "Polished marble and dark walnut surfaces, velvet banquettes, brass and cut crystal, heavy linen and a thick carpeted floor",
  },
];

/** Time character -> the quality and direction of light. */
const TIMES: Phrase[] = [
  {
    match: ["golden", "sunset", "dusk", "evening", "early evening"],
    text: "Low golden sunlight raking in almost horizontally through tall windows, long shadows stretched across the floor",
  },
  {
    match: ["night", "late", "midnight", "dark"],
    text: "Full dark outside the windows with the glass reflecting the room back, all light coming from warm interior fixtures",
  },
  {
    match: ["morning", "sunrise", "breakfast", "early"],
    text: "Cool pale morning light from one side, the air still and slightly hazy",
  },
  {
    match: ["midday", "noon", "afternoon", "day", "bright"],
    text: "Bright neutral daylight flooding in from large windows, crisp shadows under the furniture",
  },
  {
    match: ["winter", "snow", "cold"],
    text: "Flat cold light from a grey sky outside, snow visible piled against the window frames",
  },
  {
    match: ["summer", "warm season"],
    text: "Strong warm daylight with green foliage visible outside the windows",
  },
];

/** Mood -> a colour palette, the last element of the recommended structure. */
const PALETTES: Phrase[] = [
  {
    match: ["cozy", "cosy", "warm", "intimate", "rustic", "homey"],
    text: "Palette of deep amber, aged brass, oxblood and warm brown",
  },
  {
    match: ["energetic", "lively", "fun", "festive"],
    text: "Palette of warm coral, brass, cream and one deep teal accent",
  },
  {
    match: ["elegant", "formal", "refined", "upscale", "classy"],
    text: "Palette of charcoal, cream, dark green and polished gold",
  },
  {
    match: ["quiet", "calm", "peaceful", "fresh", "bright"],
    text: "Palette of bone white, pale oak, sage and soft grey",
  },
];

export function buildWorldPrompt(seed: WorldSeed): string {
  const description = clean(seed.description);
  const groupSize = normalizeGroupSize(seed.groupSize);
  const location = clean(seed.location);

  // eventType is the deliberate answer, so it wins; the free-text
  // description is only consulted when it matches nothing.
  const space =
    tryPick(SPACES, seed.eventType ?? "") ?? pick(SPACES, description);
  const materials = pick(MATERIALS, seed.priceCharacter ?? "");
  const lighting = pick(MOODS, seed.mood ?? "");
  const timeOfDay = pick(TIMES, seed.timeCharacter ?? "");
  const palette = pick(PALETTES, seed.mood ?? "");

  const parts: string[] = [];

  // 1. Architecture / space, anchored to the host's own words.
  parts.push(`${sentenceCase(space)}.`);
  if (description) parts.push(`${sentenceCase(description)}.`);
  if (location) {
    parts.push(
      `The view through the windows is a ${location} street at this hour, softly out of focus.`
    );
  }

  // 2. Materials. 3. Lighting and time.
  parts.push(`${materials}.`);
  parts.push(`${lighting}.`);
  parts.push(`${timeOfDay}.`);

  // 4. Explicit scale, and the room deliberately left empty.
  parts.push(
    `Scaled for ${groupSize} ${groupSize === 1 ? "person" : "people"}: ${seatingFor(
      groupSize
    )}, set with plates and glassware but completely unoccupied, no people anywhere in the scene.`
  );

  // 5. Palette. 6. Ground, ceiling and boundaries.
  parts.push(`${palette}.`);
  parts.push(
    "Continuous floor with visible material detail, a clearly defined ceiling overhead, and clear sightlines from the centre of the room to every wall."
  );

  parts.push(
    "Photographic interior, physically plausible proportions, no text, no signage, no logos."
  );

  return capLength(parts.join(" ").replace(/\s+/g, " ").trim());
}

/** Human-friendly display name for the generation request. */
export function buildWorldDisplayName(seed: WorldSeed): string {
  const eventType = clean(seed.eventType) || "Event";
  const location = clean(seed.location);
  const base = location ? `${eventType} — ${location}` : eventType;
  return truncate(base, 80);
}

/** Turns a headcount into concrete furniture rather than a number. */
function seatingFor(groupSize: number): string {
  if (groupSize <= 2) return "one small two-top by the window";
  if (groupSize <= 4) return "a single square table with four chairs";
  if (groupSize <= 8) return `one long table with ${groupSize} chairs drawn up to it`;
  if (groupSize <= 16) {
    return `two long tables pushed together with ${groupSize} chairs around them`;
  }
  return `several long tables arranged end to end with roughly ${groupSize} chairs`;
}

function clean(value: string | undefined | null): string {
  return (value ?? "").trim();
}

function normalizeGroupSize(groupSize: number): number {
  if (!Number.isFinite(groupSize) || groupSize <= 0) return 4;
  return Math.round(groupSize);
}

function sentenceCase(value: string): string {
  const trimmed = value.replace(/[.\s]+$/, "");
  return trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : trimmed;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

/**
 * Marble caps `text_prompt` at 2,000 characters. Trim at a sentence
 * boundary so a truncated prompt is never left mid-clause.
 */
function capLength(prompt: string): string {
  if (prompt.length <= MAX_PROMPT_CHARS) return prompt;
  const clipped = prompt.slice(0, MAX_PROMPT_CHARS);
  const lastStop = clipped.lastIndexOf(". ");
  return lastStop > 0 ? clipped.slice(0, lastStop + 1) : clipped;
}
