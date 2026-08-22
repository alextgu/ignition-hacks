import type { WorldSeed } from "./types.ts";

/**
 * Converts an approved WorldSeed into a World Labs `text_prompt`.
 *
 * The seed's fields are the kind of words people use on a form — "cozy",
 * "mid-range", "golden hour". Marble cannot render any of those directly.
 * Its own guidance asks for a specific location described with concrete,
 * spatial, sensory detail, and warns against abstract emotions, narrative
 * description, and flat decorative imagery. Plan-it deliberately makes that
 * location a small floating event planet rather than a conventional room.
 * The structure that works is:
 *
 *   [planet composition] + [event landmark] + [materials] +
 *   [lighting & time] + [miniature scale] + [curved boundary]
 *
 * So the job of this file is translation: each vague form answer is mapped
 * onto renderable physical language before the prompt is assembled in that
 * order. "cozy" becomes low warm pools of lamplight and deep corner
 * shadows; "mid-range" becomes oak, tile and brass. That mapping is the
 * difference between a generic interior and the recognizable Plan-it planet.
 *
 * Two deliberate choices worth knowing:
 *
 *  - **The planet is asked for empty.** Marble does not generate human
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

/** Event type -> a small landmark arranged on the planet's upper surface. */
const SPACES: Phrase[] = [
  {
    match: ["dinner", "birthday", "anniversary", "celebration", "date"],
    text: "a tiny open-air dining pavilion with a curved canopy and a long shared table",
  },
  {
    match: ["party", "night out", "cocktail", "housewarming"],
    text: "a tiny circular dance platform, a sculptural bar kiosk and clustered cocktail tables",
  },
  {
    match: ["corporate", "offsite", "meeting", "networking", "mixer", "work"],
    text: "a small open-sided meeting pavilion with a boardroom table and a serving kiosk",
  },
  {
    match: ["brunch", "coffee", "cafe", "lunch"],
    text: "a tiny cafe terrace with marble-topped tables, bentwood chairs and a striped canopy",
  },
  {
    match: ["hangout", "casual", "chill", "catch up", "meetup"],
    text: "a sunken circular lounge with curved banquettes, low tables and a tiny drinks kiosk",
  },
  {
    match: ["picnic", "park", "outdoor", "patio", "rooftop", "garden"],
    text: "a stepped rooftop terrace landmark with planters, string lights and a small dance platform",
  },
];

/** Mood -> light behaviour and shadow, never the emotion word itself. */
const MOODS: Phrase[] = [
  {
    match: ["cozy", "cosy", "warm", "intimate", "relaxed", "comfortable"],
    text: "Low warm pools of light from miniature lanterns and table candles, with soft shadows beneath the tiny structures",
  },
  {
    match: ["energetic", "lively", "fun", "loud", "festive", "celebratory"],
    text: "Bright even light with warm lantern spill and a few saturated colour washes across the dance platform, with no deep shadow",
  },
  {
    match: ["elegant", "formal", "refined", "upscale", "classy", "fancy"],
    text: "Restrained warm lanterns picking out the table settings, with soft highlights on glass and metal",
  },
  {
    match: ["quiet", "calm", "peaceful", "low key", "mellow"],
    text: "Even diffuse daylight with almost no hard shadow, light falling softly across the floor",
  },
  {
    match: ["rustic", "homey", "old", "vintage", "traditional"],
    text: "Warm uneven light from mismatched lanterns, visible dust in the beams and shadows pooling under the furniture",
  },
];

/** Price character -> actual materials and surfaces. */
const MATERIALS: Phrase[] = [
  {
    match: ["mid", "moderate", "reasonable", "standard", "middle"],
    text: "Solid oak tables, patterned tile paths, small plaster structures, brass fixtures and simple stoneware",
  },
  {
    match: ["budget", "cheap", "affordable", "casual", "low", "inexpensive"],
    text: "Scuffed pine tabletops, painted brick kiosks, canvas bench seating and mismatched glassware",
  },
  {
    match: ["splurge", "expensive", "premium", "luxury", "high", "upscale", "fine"],
    text: "Polished marble and dark walnut surfaces, velvet banquettes, brass and cut crystal, heavy linen and clipped dark-green planting",
  },
];

/** Time character -> the quality and direction of light. */
const TIMES: Phrase[] = [
  {
    match: ["golden", "sunset", "dusk", "evening", "early evening"],
    text: "Low golden sunlight raking across the curved planet surface, with long shadows from every miniature structure",
  },
  {
    match: ["night", "late", "midnight", "dark"],
    text: "A deep night sky around the planet, with all light coming from warm miniature lanterns and table candles",
  },
  {
    match: ["morning", "sunrise", "breakfast", "early"],
    text: "Cool pale morning light from one side, with a soft haze around the planet edge",
  },
  {
    match: ["midday", "noon", "afternoon", "day", "bright"],
    text: "Bright neutral daylight across the whole planetoid, with crisp shadows under the furniture",
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

  // 1. Lock the composition before describing details. Without these camera
  // and boundary instructions Marble tends to turn event words into a
  // first-person restaurant interior.
  parts.push(
    "A miniature floating event planetoid diorama suspended in open sky, seen from an elevated three-quarter viewpoint with the camera angled down about 35 degrees."
  );
  parts.push(
    "The entire round silhouette and curved edge of the planet are visible at once, with generous empty space around it."
  );

  // 2. Event landmark, anchored to the host's own words.
  parts.push(`On the upper surface sits ${space}.`);
  if (description) parts.push(`${sentenceCase(description)}.`);
  if (location) {
    parts.push(
      `Tiny abstract landscape and skyline cues inspired by ${location} sit along one edge of the surface, never becoming a full-sized city.`
    );
  }

  // 3. Materials. 4. Lighting and time.
  parts.push(`${materials}.`);
  parts.push(`${lighting}.`);
  parts.push(`${timeOfDay}.`);

  // 5. Explicit miniature scale, deliberately left empty.
  parts.push(
    `Miniature seating scaled for ${groupSize} ${groupSize === 1 ? "person" : "people"}: ${seatingFor(
      groupSize
    )}, set with plates and glassware but completely unoccupied, no people anywhere in the scene.`
  );

  // 6. Palette and a planetary ground boundary Marble can reconstruct.
  parts.push(`${palette}.`);
  parts.push(
    "One continuous rounded ground surface visibly curves away on every side into a clean circular edge; every landmark stays on the upper hemisphere, with clear foreground, middle distance and background depth."
  );

  parts.push(
    "Stylized handcrafted clay-and-painted-wood miniature, contemporary editorial 3D illustration, softly rounded forms and tactile detail, not photographic realism."
  );
  parts.push(
    "No interior room, no enclosing walls, no ceiling, no first-person or eye-level view, no close-up, no flat map, no giant full-scale landscape, no text, no signage, no logos."
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
  if (groupSize <= 2) return "one small two-top beside a lantern";
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
