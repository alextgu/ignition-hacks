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

/**
 * One image handed to World Labs, either by public URL or by the id of an
 * asset already uploaded to them.
 */
export type WorldImageInput =
  | { source: "uri"; uri: string }
  | { source: "mediaAsset"; mediaAssetId: string };

/** Which side of the room a photo was taken from, for multi-image builds. */
export type WorldImageDirection = "front" | "right" | "back" | "left";

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

  /**
   * A photo of the real venue. When present the world is generated FROM this
   * image rather than from text alone, so the scene is the actual place
   * instead of a plausible guess. The text prompt is still sent alongside it
   * to steer atmosphere.
   */
  venuePhoto?: WorldImageInput;

  /**
   * Photos contributed by guests after the event. When present, the world is
   * reconstructed from them (up to 8) — this is what turns the event's world
   * into a record of the evening that actually happened rather than a
   * proposal. Takes precedence over `venuePhoto`.
   *
   * Note: areas the cameras never saw are filled in plausibly by the model,
   * so this is a keepsake, not a survey.
   */
  guestPhotos?: Array<WorldImageInput & { direction?: WorldImageDirection }>;

  /**
   * Set for outdoor or expansive scenes (rooftops, parks, large halls) to
   * select the larger generation model. Costs more credits.
   */
  expansive?: boolean;
};

/** Generation status of a requested world, independent of the provider. */
export type WorldStatus = "pending" | "ready" | "failed";

/**
 * Everything needed to render the finished world in our own viewer rather
 * than only linking out to World Labs'.
 *
 * The splat URLs feed SparkJS (World Labs' own THREE.js renderer), and
 * `scale` / `groundPlaneOffset` are what let the app place guest markers on
 * the actual floor of the generated room instead of guessing at it.
 */
export type WorldAssets = {
  /** Gaussian splat files by density. Use `low` on mobile. */
  splatUrls?: { low?: string; medium?: string; full?: string };
  /** GLB collider mesh — raycast against it to place objects on real geometry. */
  colliderMeshUrl?: string;
  /** Equirectangular panorama of the scene. */
  panoUrl?: string;
  /** World scale factor reported by the model. */
  scale?: number;
  /** Y offset of the floor, in world units. */
  groundPlaneOffset?: number;
  /** Model-written description of the scene. */
  caption?: string;
};

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
  /**
   * Assets for rendering the world in-app. Present once status is "ready".
   * Callers that only need a link can ignore this entirely.
   */
  assets?: WorldAssets;
  /** Human-readable error message, present only when status is "failed". */
  error?: string;
};

/** Common interface implemented by both the real and mock adapters. */
export interface WorldLabsAdapter {
  generateWorld(seed: WorldSeed): Promise<WorldResult>;
  getWorldStatus(externalId: string): Promise<WorldResult>;
}
