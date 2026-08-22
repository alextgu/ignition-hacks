/**
 * ElevenLabs Agents Platform request/response shapes.
 *
 * NOT exported from `./index.ts` — no code outside
 * `src/integrations/elevenlabs/**` should know these exist. Only
 * `EventBrief` / `BookingCallResult` cross the boundary. Kept intentionally
 * partial: only the fields this adapter reads are modeled.
 *
 * Sources:
 *   POST /v1/convai/twilio/outbound-call — https://elevenlabs.io/docs/agents-platform/api-reference/twilio/outbound-call
 *   GET  /v1/convai/conversations/{id}   — https://elevenlabs.io/docs/api-reference/conversations/get
 *   Overrides                            — https://elevenlabs.io/docs/eleven-agents/customization/personalization/overrides
 */

/** Per-call context passed alongside an outbound call request. */
export type ConversationInitiationClientData = {
  /** Values the dashboard prompt can reference as {{name}}. */
  dynamic_variables?: Record<string, string>;
  /**
   * Replaces agent settings for this one conversation. Each field used here
   * must have its matching toggle enabled in the agent's Security tab.
   */
  conversation_config_override?: {
    agent?: {
      prompt?: { prompt?: string };
      first_message?: string;
      language?: string;
    };
  };
};

export type OutboundCallRequest = {
  agent_id: string;
  agent_phone_number_id: string;
  to_number: string;
  conversation_initiation_client_data?: ConversationInitiationClientData;
  call_recording_enabled?: boolean;
};

export type OutboundCallResponse = {
  success?: boolean;
  message?: string;
  conversation_id?: string;
  callSid?: string;
};

/** Conversation lifecycle states returned by the conversations API. */
export type ElevenLabsConversationStatus =
  | "initiated"
  | "in-progress"
  | "processing"
  | "done"
  | "failed";

export type ElevenLabsTranscriptEntry = {
  role?: string;
  message?: string | null;
  time_in_call_secs?: number;
};

export type ElevenLabsDataCollectionResult = {
  value?: unknown;
  rationale?: string;
};

export type ElevenLabsAnalysis = {
  call_successful?: "success" | "failure" | "unknown";
  transcript_summary?: string;
  /**
   * Results of the agent's configured data-collection fields. The adapter
   * looks for the optional `booking_confirmed`, `confirmed_time`, and
   * `confirmed_party_size` items documented in docs/elevenlabs-setup.md.
   */
  data_collection_results?: Record<string, ElevenLabsDataCollectionResult>;
};

export type ElevenLabsConversation = {
  conversation_id?: string;
  agent_id?: string;
  status?: ElevenLabsConversationStatus;
  transcript?: ElevenLabsTranscriptEntry[];
  analysis?: ElevenLabsAnalysis | null;
  metadata?: {
    start_time_unix_secs?: number;
    call_duration_secs?: number;
    cost_fiat?: number;
  };
};
