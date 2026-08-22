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
