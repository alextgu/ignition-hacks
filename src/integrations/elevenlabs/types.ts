/**
 * Public contract for the ElevenLabs booking-agent integration.
 *
 * This is the "booking-agent boundary" described in project.md. The rest of
 * the application depends ONLY on the types and functions exported here and
 * from `./index.ts`. Nothing about the ElevenLabs Agents API — its endpoints,
 * conversation lifecycle, or payload shapes — leaks past this file.
 *
 * See `docs/elevenlabs-setup.md` for setup and required credentials.
 */

/** A single time window the group is available for. */
export type TimeWindow = {
  /** ISO-8601 start, e.g. "2026-09-12T19:00:00-04:00". */
  startIso: string;
  /** ISO-8601 end. */
  endIso: string;
};

/**
 * What the agent is allowed to agree to without coming back to the host.
 * This is the "host's permitted negotiation range" from project.md — the
 * agent must never commit beyond these bounds.
 */
export type NegotiationBounds = {
  /** Hard ceiling per person, in the event's currency. Agent must not exceed. */
  maxPricePerPerson?: number;
  /** May the agent accept a time outside `preferredWindows` if offered? */
  timeFlexible: boolean;
  /** May the agent accept a smaller table than `partySize` (split seating)? */
  acceptSplitSeating: boolean;
  /** Minutes earlier/later than a preferred window the agent may accept. */
  timeToleranceMinutes?: number;
};

/**
 * The confirmed event brief handed to the booking agent once the host marks
 * an event "Ready to plan". Mirrors the brief contents listed in project.md.
 */
export type EventBrief = {
  /** SnapPlan event id, used for correlation/logging only. */
  eventId: string;
  /** Human name of the venue being called. */
  venueName: string;
  /** E.164 phone number to dial, e.g. "+14165550123". */
  venuePhoneNumber: string;
  /** General area or city, for context if the venue asks. */
  location: string;
  /** Confirmed party size. */
  partySize: number;
  /** Group-preferred windows, best first. */
  preferredWindows: TimeWindow[];
  /** Approximate per-person budget the group agreed to. */
  budgetPerPerson?: number;
  /** Currency code for budget figures, defaults to "CAD" when omitted. */
  currency?: string;
  /** e.g. "a quiet booth", "patio if available". */
  seatingPreference?: string;
  /** e.g. ["one vegan", "no shellfish"]. */
  dietaryNotes?: string[];
  /** Name the agent gives the venue when making the reservation. */
  hostName: string;
  /** Callback number to leave with the venue, if the host provided one. */
  hostCallbackNumber?: string;
  /** Bounds the agent must negotiate within. */
  negotiation: NegotiationBounds;
};

/** Lifecycle of a booking call, independent of the provider. */
export type BookingCallStatus = "pending" | "in_progress" | "completed" | "failed";

/** What the call actually achieved, once it has completed. */
export type BookingOutcome =
  /** Venue confirmed a reservation. `confirmedTime` should be set. */
  | "booked"
  /** Venue could not accommodate the group at all. */
  | "declined"
  /** Something was offered/said that needs a human decision. */
  | "needs_followup"
  /** Call completed but the result could not be determined. */
  | "unknown";

/** One line of the call transcript. */
export type TranscriptLine = {
  /** "agent" for our voice agent, "user" for the person at the venue. */
  role: "agent" | "user";
  message: string;
  atSeconds: number;
};

/** Result returned by both `startBookingCall` and `getBookingCallStatus`. */
export type BookingCallResult = {
  status: BookingCallStatus;
  /** Opaque id for polling. Treat as a black box — shape differs per adapter. */
  externalId?: string;
  /** Present once `status` is "completed". */
  outcome?: BookingOutcome;
  /** ISO-8601 time the venue actually confirmed, when `outcome` is "booked". */
  confirmedTime?: string;
  /** Party size the venue confirmed, if it differs from the requested size. */
  confirmedPartySize?: number;
  /** Short natural-language summary of how the call went. */
  summary?: string;
  /** Full transcript, when available. */
  transcript?: TranscriptLine[];
  /** Call length in seconds, when known. */
  durationSeconds?: number;
  /** Human-readable error, present only when `status` is "failed". */
  error?: string;
};

/** Common interface implemented by both the real and mock adapters. */
export interface BookingAgentAdapter {
  startBookingCall(brief: EventBrief): Promise<BookingCallResult>;
  getBookingCallStatus(externalId: string): Promise<BookingCallResult>;
}
