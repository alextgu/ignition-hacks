import type { ElevenLabsConfig } from "./config.ts";
import { missingCredentials } from "./config.ts";
import { buildCallScript } from "./briefMapper.ts";
import { fetchJson } from "../shared/httpJson.ts";
import type {
  BookingAgentAdapter,
  BookingCallResult,
  BookingOutcome,
  EventBrief,
  TranscriptLine,
} from "./types.ts";
import type {
  ConversationInitiationClientData,
  ElevenLabsAnalysis,
  ElevenLabsConversation,
  OutboundCallRequest,
  OutboundCallResponse,
} from "./internalApiTypes.ts";

/**
 * Real adapter backed by the ElevenLabs Agents Platform.
 *
 * Flow:
 *   1. startBookingCall  -> POST /v1/convai/twilio/outbound-call
 *      Dials the venue through the Twilio number imported into ElevenLabs
 *      and returns a `conversation_id` immediately. The call itself then
 *      happens asynchronously over the phone line.
 *   2. getBookingCallStatus -> GET /v1/convai/conversations/{conversation_id}
 *      Polls the conversation. Once status is "done", the response carries
 *      the transcript and (if the agent is configured for it) an analysis
 *      block with a summary and data-collection results.
 *
 * Only ONE agent is created — in the dashboard, once. Per-call context (this
 * venue, this party size, these constraints) is injected via dynamic
 * variables and an optional prompt override rather than by creating a new
 * agent per booking.
 *
 * Every network failure is converted into `{ status: "failed", error }`;
 * this adapter never throws.
 */
export class RealBookingAgentAdapter implements BookingAgentAdapter {
  private readonly config: ElevenLabsConfig;

  constructor(config: ElevenLabsConfig) {
    this.config = config;
  }

  async startBookingCall(brief: EventBrief): Promise<BookingCallResult> {
    const missing = missingCredentials(this.config);
    if (missing.length > 0) {
      return {
        status: "failed",
        error: `ElevenLabs is not fully configured. Missing: ${missing.join(", ")}.`,
      };
    }

    if (!brief.venuePhoneNumber?.trim()) {
      return {
        status: "failed",
        error: "Cannot place a booking call: the brief has no venue phone number.",
      };
    }

    const script = buildCallScript(brief);

    const clientData: ConversationInitiationClientData = {
      dynamic_variables: script.dynamicVariables,
    };

    if (this.config.usePromptOverride) {
      clientData.conversation_config_override = {
        agent: {
          prompt: { prompt: script.systemPrompt },
          first_message: script.firstMessage,
          language: "en",
        },
      };
    }

    const body: OutboundCallRequest = {
      agent_id: this.config.agentId!,
      agent_phone_number_id: this.config.agentPhoneNumberId!,
      to_number: brief.venuePhoneNumber.trim(),
      conversation_initiation_client_data: clientData,
      call_recording_enabled: this.config.callRecordingEnabled,
    };

    const result = await fetchJson<OutboundCallResponse>(
      `${this.config.baseUrl}/v1/convai/twilio/outbound-call`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": this.config.apiKey!,
        },
        body: JSON.stringify(body),
      },
      { serviceLabel: "ElevenLabs", timeoutMs: this.config.timeoutMs }
    );

    if (!result.ok) {
      return { status: "failed", error: result.message };
    }

    if (result.data.success === false) {
      return {
        status: "failed",
        error: result.data.message || "ElevenLabs declined to place the call.",
      };
    }

    if (!result.data.conversation_id) {
      return {
        status: "failed",
        error: "ElevenLabs accepted the call but returned no conversation id to poll.",
      };
    }

    return { status: "pending", externalId: result.data.conversation_id };
  }

  async getBookingCallStatus(externalId: string): Promise<BookingCallResult> {
    const missing = missingCredentials(this.config);
    if (missing.length > 0) {
      return {
        status: "failed",
        error: `ElevenLabs is not fully configured. Missing: ${missing.join(", ")}.`,
      };
    }

    const result = await fetchJson<ElevenLabsConversation>(
      `${this.config.baseUrl}/v1/convai/conversations/${encodeURIComponent(externalId)}`,
      {
        method: "GET",
        headers: { "xi-api-key": this.config.apiKey! },
      },
      { serviceLabel: "ElevenLabs", timeoutMs: this.config.timeoutMs }
    );

    if (!result.ok) {
      return { status: "failed", error: result.message };
    }

    return conversationToBookingResult(externalId, result.data);
  }
}

export function conversationToBookingResult(
  externalId: string,
  conversation: ElevenLabsConversation
): BookingCallResult {
  const base: BookingCallResult = {
    status: "in_progress",
    externalId: conversation.conversation_id || externalId,
  };

  const durationSeconds = conversation.metadata?.call_duration_secs;
  if (durationSeconds !== undefined) base.durationSeconds = durationSeconds;

  switch (conversation.status) {
    case "initiated":
      return { ...base, status: "pending" };

    case "in-progress":
    case "processing":
      // "processing" means the call has ended but post-call analysis is still
      // running. Surface the transcript we already have while we wait.
      return { ...base, status: "in_progress", transcript: mapTranscript(conversation) };

    case "failed":
      return {
        ...base,
        status: "failed",
        error: "The booking call failed to connect or was dropped by the provider.",
        transcript: mapTranscript(conversation),
      };

    case "done": {
      const transcript = mapTranscript(conversation);
      const analysis = conversation.analysis ?? undefined;
      const completed: BookingCallResult = {
        ...base,
        status: "completed",
        outcome: deriveOutcome(analysis),
        transcript,
      };
      if (analysis?.transcript_summary) completed.summary = analysis.transcript_summary;

      const confirmedTime = readStringDataPoint(analysis, "confirmed_time");
      if (confirmedTime) completed.confirmedTime = confirmedTime;

      const confirmedPartySize = readNumberDataPoint(analysis, "confirmed_party_size");
      if (confirmedPartySize !== undefined) completed.confirmedPartySize = confirmedPartySize;

      return completed;
    }

    default:
      // Unknown/absent status: treat as still running rather than inventing
      // a terminal state. Callers keep polling; nothing is falsely reported
      // as booked.
      return { ...base, status: "in_progress", transcript: mapTranscript(conversation) };
  }
}

/**
 * Decides the booking outcome.
 *
 * **Only an explicit `booking_confirmed` data-collection field can produce
 * "booked".** Nothing else is evidence of a reservation.
 *
 * `call_successful` is deliberately NOT treated as confirmation. In
 * ElevenLabs it means the *call* went well — the agent connected, spoke, and
 * completed its task cleanly. A call where the venue says "we're completely
 * booked Friday" is a perfectly successful call, and mapping that to "booked"
 * reported a reservation that does not exist. It is used here only in the
 * negative direction: an outright call failure is a "declined".
 *
 * The cost of this is that an agent without a `booking_confirmed` field
 * configured can never report "booked" — it reports "needs_followup", which
 * is the honest answer, because in that configuration the system genuinely
 * does not know. See `docs/elevenlabs-setup.md` for the field to add.
 *
 * project.md: booking actions must never appear successful until an external
 * path actually confirms.
 */
function deriveOutcome(analysis: ElevenLabsAnalysis | undefined): BookingOutcome {
  const confirmed = readBooleanDataPoint(analysis, "booking_confirmed");
  if (confirmed === true) return "booked";
  if (confirmed === false) return "declined";

  // No structured answer from the agent: the call outcome alone cannot tell
  // us whether a table was held, so a human has to look.
  return analysis?.call_successful === "failure" ? "declined" : "needs_followup";
}

function mapTranscript(conversation: ElevenLabsConversation): TranscriptLine[] {
  return (conversation.transcript ?? [])
    .filter((entry) => typeof entry.message === "string" && entry.message.trim() !== "")
    .map((entry) => ({
      role: entry.role === "user" ? "user" : "agent",
      message: (entry.message as string).trim(),
      atSeconds: entry.time_in_call_secs ?? 0,
    }));
}

function readDataPoint(
  analysis: ElevenLabsAnalysis | undefined,
  key: string
): unknown {
  return analysis?.data_collection_results?.[key]?.value;
}

function readStringDataPoint(
  analysis: ElevenLabsAnalysis | undefined,
  key: string
): string | undefined {
  const value = readDataPoint(analysis, key);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function readNumberDataPoint(
  analysis: ElevenLabsAnalysis | undefined,
  key: string
): number | undefined {
  const value = readDataPoint(analysis, key);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function readBooleanDataPoint(
  analysis: ElevenLabsAnalysis | undefined,
  key: string
): boolean | undefined {
  const value = readDataPoint(analysis, key);
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "confirmed"].includes(normalized)) return true;
    if (["false", "no", "declined"].includes(normalized)) return false;
  }
  return undefined;
}
