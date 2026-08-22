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

export type EventRecord = CreateEventInput & {
  id: string;
  publicSlug: string;
  managementToken: string;
  status: "coordinating" | "ready";
  worldStatus: "pending" | "ready" | "failed";
  worldEmbedUrl: string | null;
  worldPreviewImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
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

export type UpsertAttendeeInput = {
  displayName: string;
  selectedTimeOptions: string[];
  priceResponse: PriceResponse;
};

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };
