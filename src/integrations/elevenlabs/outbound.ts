import type { BookingConfig } from "./config";

export const OUTBOUND_CALL_URL =
  "https://api.elevenlabs.io/v1/convai/twilio/outbound-call";

export type OutboundCallRequest = {
  toNumber: string;
  dynamicVariables?: Record<string, string>;
  firstMessage?: string;
};

export type OutboundCallResult =
  | {
      ok: true;
      mode: "dry_run";
      request: {
        agentId: string | null;
        phoneNumberId: string | null;
        toNumber: string;
      };
    }
  | {
      ok: true;
      mode: "live";
      conversationId: string | null;
      callSid: string | null;
      message: string;
    }
  | {
      ok: false;
      error: string;
      missing?: string[];
      status?: number;
    };

type FetchLike = typeof fetch;

export async function dispatchOutboundCall(
  config: BookingConfig,
  input: OutboundCallRequest,
  options: { live?: boolean; fetchImpl?: FetchLike } = {},
): Promise<OutboundCallResult> {
  const toNumber = input.toNumber.trim();
  if (!toNumber) {
    return { ok: false, error: "Destination phone number is required." };
  }

  if (!options.live) {
    return {
      ok: true,
      mode: "dry_run",
      request: {
        agentId: config.agentId,
        phoneNumberId: config.phoneNumberId,
        toNumber,
      },
    };
  }

  if (!config.readyForLiveCall) {
    return {
      ok: false,
      error: "Live outbound calling is not configured yet.",
      missing: config.missingForLiveCall,
    };
  }

  const body: Record<string, unknown> = {
    agent_id: config.agentId,
    agent_phone_number_id: config.phoneNumberId,
    to_number: toNumber,
  };

  if (input.dynamicVariables || input.firstMessage) {
    body.conversation_initiation_client_data = {
      ...(input.dynamicVariables
        ? { dynamic_variables: input.dynamicVariables }
        : {}),
      ...(input.firstMessage
        ? {
            conversation_config_override: {
              agent: { first_message: input.firstMessage },
            },
          }
        : {}),
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(OUTBOUND_CALL_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "xi-api-key": config.apiKey!,
    },
    body: JSON.stringify(body),
  });

  let payload: {
    success?: boolean;
    message?: string;
    conversation_id?: string | null;
    callSid?: string | null;
  } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    // Keep empty payload and fall through to status-based error.
  }

  if (!response.ok || payload.success === false) {
    return {
      ok: false,
      error: payload.message || "ElevenLabs outbound call failed.",
      status: response.status,
    };
  }

  return {
    ok: true,
    mode: "live",
    conversationId: payload.conversation_id ?? null,
    callSid: payload.callSid ?? null,
    message: payload.message || "Outbound call dispatched.",
  };
}
