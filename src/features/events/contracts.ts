export type PriceResponse = "works" | "flexible" | "too_much";

export type CreateEventInput = {
  title: string;
  description: string;
  location: string;
  groupSize: number;
  priceMin: number;
  priceMax: number;
  timeOptions: string[];
};

export type WorldStatus = "pending" | "ready" | "failed";

/**
 * World Labs state carried on an event.
 *
 * Optional rather than required so existing constructors and fixtures stay
 * valid: an event created before a world exists simply has none of these.
 * `worldStatus`, `worldEmbedUrl` and `worldPreviewImageUrl` predate this
 * block and stay required — Base44 already reads them.
 */
export type EventWorldState = {
  /** Opaque World Labs operation id. Never served publicly. */
  worldExternalId?: string | null;
  /** Equirectangular panorama — what the in-app canvas renders. */
  worldPanoUrl?: string | null;
  worldSplatLowUrl?: string | null;
  worldSplatMediumUrl?: string | null;
  worldCaption?: string | null;
  /** Provider failure text. Host-facing only; never served publicly. */
  worldError?: string | null;
  worldStartedAt?: string | null;
  worldCompletedAt?: string | null;
  worldLastCheckedAt?: string | null;
};

export type EventRecord = CreateEventInput &
  EventWorldState & {
    id: string;
    publicSlug: string;
    managementToken: string;
    status: "coordinating" | "ready";
    worldStatus: WorldStatus;
    worldEmbedUrl: string | null;
    worldPreviewImageUrl: string | null;
    createdAt: string;
    updatedAt: string;
  };

/** Partial world update written by the world service. */
export type WorldStatePatch = EventWorldState & {
  worldStatus?: WorldStatus;
  worldEmbedUrl?: string | null;
  worldPreviewImageUrl?: string | null;
};


export type AttendeeRecord = {
  id: string;
  eventId: string;
  guestId: string;
  displayName: string;
  selectedTimeOptions: string[];
  priceResponse: PriceResponse;
  avatarIndex: number;
  createdAt: string;
  updatedAt: string;
};

export type InvitationRecord = {
  id: string;
  eventId: string;
  token: string;
  suggestedName: string;
  createdAt: string;
};

export type CreateInvitationsInput = {
  names: string[];
};

export type UpsertAttendeeInput = {
  displayName: string;
  selectedTimeOptions: string[];
  priceResponse: PriceResponse;
};

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };
