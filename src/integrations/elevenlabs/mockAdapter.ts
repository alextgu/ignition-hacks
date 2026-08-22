import type {
  BookingAgentAdapter,
  BookingCallResult,
  BookingOutcome,
  EventBrief,
  TranscriptLine,
} from "./types.ts";
import { formatIsoForSpeech } from "./briefMapper.ts";
import { toBase64Url, fromBase64Url } from "../shared/encoding.ts";

/**
 * Deterministic, fully offline booking-agent mock.
 *
 * project.md requires that "booking actions must never appear successful
 * until an external booking path returns confirmation" and that a
 * "deterministic fallback should be available if external services fail
 * during judging." This adapter is that fallback: it places no call, needs
 * no credentials, and produces a realistic scripted transcript built from
 * the actual brief.
 *
 * Statelessness: the brief and the call's start time are encoded into
 * `externalId`, so `getBookingCallStatus` can re-derive everything without
 * any server-side storage — it behaves identically in one process, across a
 * restart, or across serverless invocations.
 *
 * Simulated progression: status advances on elapsed wall-clock time since
 * the id was minted (pending -> in_progress -> completed), so the polling
 * and loading states in the UI can be demoed for real rather than snapping
 * straight to a finished call. Inject `now` to control this in tests.
 */

export type MockBookingOptions = {
  /** Clock injection point for tests. Defaults to `Date.now`. */
  now?: () => number;
  /** Forces a specific outcome — useful for demoing the non-happy paths. */
  forcedOutcome?: BookingOutcome;
};

/** Seconds after start at which the mock call moves from pending to talking. */
const CONNECTING_SECONDS = 3;
/** Seconds after start at which the mock call is finished and analyzed. */
const COMPLETED_SECONDS = 12;

export class MockBookingAgentAdapter implements BookingAgentAdapter {
  private readonly now: () => number;
  private readonly forcedOutcome?: BookingOutcome;

  constructor(options: MockBookingOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.forcedOutcome = options.forcedOutcome;
  }

  async startBookingCall(brief: EventBrief): Promise<BookingCallResult> {
    return {
      status: "pending",
      externalId: encodeExternalId(brief, this.now()),
    };
  }

  async getBookingCallStatus(externalId: string): Promise<BookingCallResult> {
    const decoded = decodeExternalId(externalId);
    if (!decoded) {
      return { status: "failed", error: "Unrecognized mock booking call externalId." };
    }

    const { brief, startedAtMs } = decoded;
    const elapsedSeconds = Math.max(0, Math.floor((this.now() - startedAtMs) / 1000));
    const outcome = this.forcedOutcome ?? deriveMockOutcome(brief);
    const fullTranscript = buildMockTranscript(brief, outcome);

    if (elapsedSeconds < CONNECTING_SECONDS) {
      return { status: "pending", externalId };
    }

    if (elapsedSeconds < COMPLETED_SECONDS) {
      // Reveal the transcript progressively so a live demo shows the call
      // unfolding rather than appearing all at once.
      const revealed = fullTranscript.filter((line) => line.atSeconds <= elapsedSeconds);
      return {
        status: "in_progress",
        externalId,
        transcript: revealed,
        durationSeconds: elapsedSeconds,
      };
    }

    const result: BookingCallResult = {
      status: "completed",
      externalId,
      outcome,
      transcript: fullTranscript,
      durationSeconds: COMPLETED_SECONDS,
      summary: buildMockSummary(brief, outcome),
    };

    if (outcome === "booked") {
      const primary = brief.preferredWindows[0];
      if (primary) result.confirmedTime = primary.startIso;
      result.confirmedPartySize = brief.partySize;
    }

    return result;
  }
}

const EXTERNAL_ID_PREFIX = "mock-call:";

type DecodedId = { brief: EventBrief; startedAtMs: number };

function encodeExternalId(brief: EventBrief, startedAtMs: number): string {
  const payload = JSON.stringify({ brief, startedAtMs });
  return `${EXTERNAL_ID_PREFIX}${toBase64Url(payload)}`;
}

function decodeExternalId(externalId: string): DecodedId | null {
  if (!externalId.startsWith(EXTERNAL_ID_PREFIX)) return null;
  try {
    const json = fromBase64Url(externalId.slice(EXTERNAL_ID_PREFIX.length));
    const parsed = JSON.parse(json);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.startedAtMs !== "number" ||
      typeof parsed.brief !== "object" ||
      parsed.brief === null
    ) {
      return null;
    }
    return { brief: parsed.brief as EventBrief, startedAtMs: parsed.startedAtMs };
  } catch {
    return null;
  }
}

/** A brief with no proposed times can't be booked — surface it for a human. */
function deriveMockOutcome(brief: EventBrief): BookingOutcome {
  return brief.preferredWindows.length > 0 ? "booked" : "needs_followup";
}

function buildMockTranscript(brief: EventBrief, outcome: BookingOutcome): TranscriptLine[] {
  const primary = brief.preferredWindows[0];
  const when = primary ? formatIsoForSpeech(primary.startIso) : "sometime this week";
  const lines: TranscriptLine[] = [
    { role: "user", message: `${brief.venueName}, how can I help you?`, atSeconds: 3 },
    {
      role: "agent",
      message: `Hi! I'm calling on behalf of ${brief.hostName} — I'd like to see if you have a table for ${brief.partySize} available ${when}.`,
      atSeconds: 5,
    },
  ];

  if (outcome === "booked") {
    lines.push(
      { role: "user", message: `Let me check… yes, we can do that. Can I get a name?`, atSeconds: 7 },
      { role: "agent", message: `That's under ${brief.hostName}.`, atSeconds: 8 }
    );

    if (brief.dietaryNotes && brief.dietaryNotes.length > 0) {
      lines.push(
        {
          role: "agent",
          message: `One more thing — we have ${brief.dietaryNotes.join(" and ")} in the group. Is the kitchen able to work with that?`,
          atSeconds: 9,
        },
        { role: "user", message: `That's no problem at all, we can accommodate.`, atSeconds: 10 }
      );
    }

    lines.push(
      {
        role: "agent",
        message: `Perfect — so that's ${brief.partySize} on ${when}, under ${brief.hostName}. Thank you so much!`,
        atSeconds: 11,
      },
      { role: "user", message: `You're all set. See you then!`, atSeconds: 12 }
    );
    return lines;
  }

  if (outcome === "declined") {
    lines.push(
      {
        role: "user",
        message: `I'm sorry, we're fully committed that evening and we don't have anything for a group that size.`,
        atSeconds: 7,
      },
      {
        role: "agent",
        message: `Understood — thank you for checking. I'll take it back to the group.`,
        atSeconds: 9,
      }
    );
    return lines;
  }

  lines.push(
    {
      role: "user",
      message: `For a group that size we'd need a set menu and a deposit. Do you want to go ahead?`,
      atSeconds: 7,
    },
    {
      role: "agent",
      message: `I'd rather confirm that with the group before committing. I'll follow up — thank you!`,
      atSeconds: 10,
    }
  );
  return lines;
}

function buildMockSummary(brief: EventBrief, outcome: BookingOutcome): string {
  const primary = brief.preferredWindows[0];
  const when = primary ? formatIsoForSpeech(primary.startIso) : "an unspecified time";

  switch (outcome) {
    case "booked":
      return `${brief.venueName} confirmed a table for ${brief.partySize} on ${when} under ${brief.hostName}.${
        brief.dietaryNotes && brief.dietaryNotes.length > 0
          ? ` The kitchen confirmed it can accommodate: ${brief.dietaryNotes.join(", ")}.`
          : ""
      }`;
    case "declined":
      return `${brief.venueName} could not accommodate ${brief.partySize} on ${when}. No reservation was made.`;
    case "needs_followup":
      return `${brief.venueName} requires a set menu and a deposit, which is outside the approved range. The agent did not commit and flagged this for ${brief.hostName}.`;
    default:
      return `The call to ${brief.venueName} completed but the outcome could not be determined.`;
  }
}
