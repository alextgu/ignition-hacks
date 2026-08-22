import type { EventRecord } from "../events/contracts";
import type { WorldSeed } from "../../integrations/worldlabs/types";

/**
 * Builds the World Labs `WorldSeed` for an event.
 *
 * Two jobs, and the second one is the important one:
 *
 *  1. **Translation.** The host form collects a free-form idea, a price
 *     range and a list of ISO timestamps. The prompt mapper wants words
 *     like "cozy", "splurge-worthy" and "golden hour". Everything below is
 *     that translation, kept pure so it can be unit tested without
 *     spending a generation credit.
 *
 *  2. **Redaction.** The generated world is public (an unlisted share URL),
 *     so nothing that identifies a person may reach World Labs. Attendee
 *     names, the management token and the raw event title never enter the
 *     seed at all, and the host's own description is stripped of emails,
 *     phone numbers, URLs and @handles before it is sent.
 *
 * Redaction is best-effort on free text — it cannot catch every personal
 * name a host might type — so the host form also warns against putting
 * personal details in the description. See
 * `docs/superpowers/specs/2026-08-22-world-labs-embed-design.md`.
 */

/** Patterns that must never reach an external image model. */
const REDACTIONS: Array<[RegExp, string]> = [
  // Emails first: otherwise the URL rule would eat half of one.
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, " "],
  [/\b(?:https?:\/\/|www\.)\S+/gi, " "],
  // Bare domains people paste without a scheme, e.g. "joespizza.com".
  [/\b[\w-]+\.(?:com|ca|net|org|io|co|app|dev)\b/gi, " "],
  // Phone numbers: +1 (416) 555-0134, 416-555-0134, 4165550134.
  [/\+?\d[\d\s().-]{7,}\d/g, " "],
  // Social handles.
  [/(^|\s)@[\w.]+/g, " "],
  // Long digit runs (IDs, card fragments, postal-ish codes).
  [/\b\d{5,}\b/g, " "],
];

/**
 * Strips obvious contact details out of host-authored text.
 *
 * Deliberately replaces with a space rather than a marker like "[removed]":
 * the result is fed to an image model, and a redaction marker is just one
 * more meaningless token for it to try to render.
 */
export function redactCreativeText(value: string): string {
  let result = value ?? "";
  for (const [pattern, replacement] of REDACTIONS) {
    result = result.replace(pattern, replacement);
  }
  return result.replace(/\s+/g, " ").trim();
}

type Keyworded = { match: string[]; value: string };

function classify(haystack: string, table: Keyworded[], fallback: string) {
  const needle = haystack.toLowerCase();
  for (const entry of table) {
    if (entry.match.some((word) => needle.includes(word))) return entry.value;
  }
  return fallback;
}

const EVENT_TYPES: Keyworded[] = [
  { match: ["birthday", "bday"], value: "birthday dinner" },
  { match: ["anniversary"], value: "anniversary dinner" },
  { match: ["brunch"], value: "brunch" },
  { match: ["breakfast", "coffee", "cafe", "café"], value: "coffee catch-up" },
  { match: ["lunch"], value: "lunch" },
  { match: ["dinner", "supper", "eat", "food", "restaurant"], value: "dinner" },
  { match: ["drinks", "cocktail", "bar", "pub"], value: "drinks" },
  { match: ["party", "celebrat", "housewarming"], value: "party" },
  { match: ["offsite", "team", "work", "colleague", "coworker"], value: "team offsite" },
  { match: ["meeting", "networking", "mixer"], value: "networking mixer" },
  { match: ["picnic", "park", "outdoor", "hike"], value: "picnic" },
  { match: ["rooftop", "patio", "terrace", "garden"], value: "rooftop gathering" },
  { match: ["game", "board game", "movie"], value: "hangout" },
];

const MOODS: Keyworded[] = [
  { match: ["cozy", "cosy", "intimate", "warm", "comfort", "chill", "low-key", "low key"], value: "cozy" },
  { match: ["fancy", "elegant", "classy", "upscale", "formal", "nice"], value: "elegant" },
  { match: ["fun", "lively", "energetic", "loud", "wild", "hype", "celebrat"], value: "energetic" },
  { match: ["quiet", "calm", "relax", "mellow", "peaceful"], value: "quiet" },
  { match: ["rustic", "homey", "vintage", "old-school", "traditional"], value: "rustic" },
];

/**
 * Price character from the top of the host's per-person range.
 *
 * The top matters more than the bottom: a $20–$90 range is a night where
 * someone might order the expensive thing, and the room should be able to
 * carry that.
 */
export function describePrice(priceMax: number): string {
  if (!Number.isFinite(priceMax) || priceMax <= 0) return "mid-range";
  if (priceMax <= 25) return "budget-friendly";
  if (priceMax <= 70) return "mid-range";
  return "splurge-worthy";
}

const MONTH_SEASONS = [
  "deep winter", "late winter", "early spring", "spring", "late spring",
  "early summer", "high summer", "late summer", "early autumn", "autumn",
  "late autumn", "winter",
];

/**
 * Turns the first proposed timeslot into light: the hour of day and the
 * season are the two things that actually change how a room looks.
 *
 * Uses the timestamp as written. These are host-entered local times and the
 * seed only needs "evening" vs "morning", so a timezone round-trip would add
 * risk without adding accuracy.
 */
export function describeTime(timeOptions: string[]): string {
  const first = timeOptions.find((option) => !Number.isNaN(Date.parse(option)));
  if (!first) return "early evening";

  const at = new Date(first);
  const hour = at.getUTCHours();
  const season = MONTH_SEASONS[at.getUTCMonth()] ?? "";

  let partOfDay: string;
  if (hour < 6) partOfDay = "the small hours";
  else if (hour < 11) partOfDay = "morning light";
  else if (hour < 15) partOfDay = "flat midday light";
  else if (hour < 18) partOfDay = "late afternoon";
  else if (hour < 21) partOfDay = "golden hour into dusk";
  else partOfDay = "late night";

  return season ? `${partOfDay} in ${season}` : partOfDay;
}

/**
 * Builds the seed for one event.
 *
 * Note what is NOT read from the event: `title` (hosts put names in titles —
 * "Priya's birthday"), `managementToken`, `publicSlug`, and anything about
 * attendees. Only the redacted description, the general area, the group
 * size and the derived character words go out.
 */
export function buildWorldSeed(event: EventRecord): WorldSeed {
  const description = redactCreativeText(event.description);
  // Classify from the description only — the title is excluded above, and
  // classifying on redacted text keeps the mapping consistent with what is
  // actually sent.
  const eventType = classify(description, EVENT_TYPES, "gathering");
  const mood = classify(description, MOODS, "cozy");

  return {
    description: description || "a small group getting together",
    eventType,
    mood,
    location: redactCreativeText(event.location),
    timeCharacter: describeTime(event.timeOptions),
    groupSize: event.groupSize,
    priceCharacter: describePrice(event.priceMax),
    // Outdoor scenes need the larger model to look like anything.
    expansive: ["picnic", "rooftop gathering"].includes(eventType),
  };
}
