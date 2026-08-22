import type { AttendeeRecord, EventRecord } from "../events/contracts";

/**
 * Public, non-secret view of an event's world.
 *
 * This is the ONLY shape that leaves the server for the world canvas, and
 * the canvas is embedded cross-origin by Base44 — so the redaction here is
 * load-bearing rather than tidiness. Everything private is dropped by
 * construction: `buildPublicWorldState` builds a fresh object field by
 * field instead of spreading the event, so a new column added to `events`
 * later cannot silently become public.
 *
 * Never included: the management token, guest IDs, price responses, which
 * times each guest chose, the World Labs operation id, the provider error
 * text, or the full-resolution splat URL.
 */

export type WorldStage = "seed" | "gathering" | "ready" | "booked";

export type PublicWorldState = {
  event: {
    title: string;
    description: string;
    location: string;
    groupSize: number;
  };
  world: {
    status: "pending" | "ready" | "failed";
    /**
     * True only when a real World Labs key is configured, so the canvas can
     * say "World Labs world" when it is one and "preview world" when it is
     * the deterministic fallback. The mock is indistinguishable from the
     * real adapter by design — this flag is the one place that difference is
     * allowed to surface, because labelling a fallback as a generated world
     * would be a false claim in front of judges.
     */
    live: boolean;
    /** Link out to the World Labs viewer for the full interactive world. */
    marbleUrl: string | null;
    thumbnailUrl: string | null;
    /** Equirectangular panorama — what the in-page canvas renders. */
    panoUrl: string | null;
    splatLowUrl: string | null;
    splatMediumUrl: string | null;
    caption: string | null;
    /** Seconds since generation started, for an honest progress hint. */
    elapsedSeconds: number | null;
  };
  presentation: {
    stage: WorldStage;
    attendeeCount: number;
    attendees: Array<{ label: string; avatarIndex: number }>;
  };
};

/**
 * Which of the four canvas stages the event is in.
 *
 * `booked` is reserved for the booking slice — nothing sets it yet, and it
 * is deliberately gated on an explicit confirmed booking rather than on
 * event status, because `needs_followup` must never render as booked.
 */
export function deriveStage(input: {
  attendeeCount: number;
  eventStatus: EventRecord["status"];
  bookingConfirmed?: boolean;
}): WorldStage {
  if (input.bookingConfirmed === true) return "booked";
  if (input.eventStatus === "ready") return "ready";
  return input.attendeeCount > 0 ? "gathering" : "seed";
}

/**
 * First name only.
 *
 * The canvas labels a light with the person's name, and the endpoint that
 * serves it is reachable by anyone holding the guest link. A first name is
 * enough for "that one's Sam" and is meaningfully less than a full name
 * sitting in a public JSON response.
 */
function toLabel(displayName: string): string {
  const first = displayName.trim().split(/\s+/)[0] ?? "";
  return first.slice(0, 24);
}

/**
 * True when the stored world came from the offline fallback rather than
 * from World Labs.
 *
 * `live` on its own describes the *current* configuration, which is not the
 * same question: an event generated before a key was added would otherwise
 * be labelled a real World Labs world while showing a fallback image. The
 * fallback's assets are always `data:` URIs — a real world's are always
 * fetched over https — so the stored asset itself is the reliable tell.
 */
function isFallbackWorld(event: EventRecord): boolean {
  const assets = [event.worldEmbedUrl, event.worldPreviewImageUrl];
  return assets.some((url) => typeof url === "string" && url.startsWith("data:"));
}

function elapsedSeconds(startedAt: string | null | undefined, now: string) {
  if (!startedAt) return null;
  const started = Date.parse(startedAt);
  const current = Date.parse(now);
  if (Number.isNaN(started) || Number.isNaN(current)) return null;
  return Math.max(0, Math.round((current - started) / 1000));
}

export function buildPublicWorldState(
  event: EventRecord,
  attendees: AttendeeRecord[],
  now: string,
  live = false,
): PublicWorldState {
  const ordered = [...attendees].sort((a, b) =>
    a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt),
  );

  return {
    event: {
      title: event.title,
      description: event.description,
      location: event.location,
      groupSize: event.groupSize,
    },
    world: {
      status: event.worldStatus,
      live: live && !isFallbackWorld(event),
      marbleUrl: event.worldEmbedUrl ?? null,
      thumbnailUrl: event.worldPreviewImageUrl ?? null,
      panoUrl: event.worldPanoUrl ?? null,
      splatLowUrl: event.worldSplatLowUrl ?? null,
      splatMediumUrl: event.worldSplatMediumUrl ?? null,
      caption: event.worldCaption ?? null,
      elapsedSeconds: elapsedSeconds(event.worldStartedAt, now),
    },
    presentation: {
      stage: deriveStage({
        attendeeCount: ordered.length,
        eventStatus: event.status,
      }),
      attendeeCount: ordered.length,
      attendees: ordered.map((attendee) => ({
        label: toLabel(attendee.displayName),
        avatarIndex: attendee.avatarIndex,
      })),
    },
  };
}
