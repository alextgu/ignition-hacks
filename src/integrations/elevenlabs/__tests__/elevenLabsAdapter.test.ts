import test from "node:test";
import assert from "node:assert/strict";
import { RealBookingAgentAdapter } from "../elevenLabsAdapter.ts";
import type { ElevenLabsConfig } from "../config.ts";
import { sampleBrief } from "./fixtures.ts";

const config: ElevenLabsConfig = {
  apiKey: "test-key",
  agentId: "agent_test",
  agentPhoneNumberId: "phnum_test",
  baseUrl: "https://api.elevenlabs.test",
  timeoutMs: 5_000,
  usePromptOverride: true,
  callRecordingEnabled: false,
  forceMock: false,
  mockOutcome: undefined,
};

function withMockFetch<T>(
  handler: (url: string, init: RequestInit) => Promise<Response> | Response,
  run: () => Promise<T>
): Promise<T> {
  const original = globalThis.fetch;
  // @ts-expect-error -- test double, signature intentionally narrowed
  globalThis.fetch = async (url: string, init: RequestInit) => handler(url, init);
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("startBookingCall posts to the outbound-call endpoint with the xi-api-key header", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;

  await withMockFetch(
    async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return jsonResponse({ success: true, conversation_id: "conv_1", callSid: "CA1" });
    },
    async () => {
      const adapter = new RealBookingAgentAdapter(config);
      const result = await adapter.startBookingCall(sampleBrief);
      assert.equal(result.status, "pending");
      assert.equal(result.externalId, "conv_1");
    }
  );

  assert.equal(capturedUrl, "https://api.elevenlabs.test/v1/convai/twilio/outbound-call");
  assert.equal((capturedInit?.headers as Record<string, string>)["xi-api-key"], "test-key");
});

test("startBookingCall sends agent id, phone number id and the dialled number", async () => {
  await withMockFetch(
    async (_url, init) => {
      const body = JSON.parse(init.body as string);
      assert.equal(body.agent_id, "agent_test");
      assert.equal(body.agent_phone_number_id, "phnum_test");
      assert.equal(body.to_number, "+14165550123");
      assert.equal(body.call_recording_enabled, false);
      return jsonResponse({ success: true, conversation_id: "conv_2" });
    },
    async () => {
      const adapter = new RealBookingAgentAdapter(config);
      const result = await adapter.startBookingCall(sampleBrief);
      assert.equal(result.status, "pending");
    }
  );
});

test("startBookingCall sends dynamic variables and a prompt override when enabled", async () => {
  await withMockFetch(
    async (_url, init) => {
      const body = JSON.parse(init.body as string);
      const clientData = body.conversation_initiation_client_data;
      assert.equal(clientData.dynamic_variables.party_size, "6");
      assert.equal(clientData.dynamic_variables.venue_name, "Osteria Rialto");
      assert.match(
        clientData.conversation_config_override.agent.prompt.prompt,
        /Osteria Rialto/
      );
      assert.match(
        clientData.conversation_config_override.agent.first_message,
        /table for 6/
      );
      return jsonResponse({ success: true, conversation_id: "conv_3" });
    },
    async () => {
      const adapter = new RealBookingAgentAdapter(config);
      await adapter.startBookingCall(sampleBrief);
    }
  );
});

test("startBookingCall omits the prompt override when disabled but still sends variables", async () => {
  await withMockFetch(
    async (_url, init) => {
      const clientData = JSON.parse(init.body as string).conversation_initiation_client_data;
      assert.equal(clientData.conversation_config_override, undefined);
      assert.ok(clientData.dynamic_variables);
      return jsonResponse({ success: true, conversation_id: "conv_4" });
    },
    async () => {
      const adapter = new RealBookingAgentAdapter({ ...config, usePromptOverride: false });
      await adapter.startBookingCall(sampleBrief);
    }
  );
});

test("startBookingCall fails when ElevenLabs reports success:false", async () => {
  await withMockFetch(
    async () => jsonResponse({ success: false, message: "number not reachable" }),
    async () => {
      const adapter = new RealBookingAgentAdapter(config);
      const result = await adapter.startBookingCall(sampleBrief);
      assert.equal(result.status, "failed");
      assert.match(result.error!, /number not reachable/);
    }
  );
});

test("startBookingCall fails when no conversation id comes back to poll", async () => {
  await withMockFetch(
    async () => jsonResponse({ success: true }),
    async () => {
      const adapter = new RealBookingAgentAdapter(config);
      const result = await adapter.startBookingCall(sampleBrief);
      assert.equal(result.status, "failed");
      assert.match(result.error!, /no conversation id/i);
    }
  );
});

test("startBookingCall reports missing credentials without calling fetch", async () => {
  let called = false;
  await withMockFetch(
    async () => {
      called = true;
      return jsonResponse({});
    },
    async () => {
      const adapter = new RealBookingAgentAdapter({ ...config, agentId: undefined });
      const result = await adapter.startBookingCall(sampleBrief);
      assert.equal(result.status, "failed");
      assert.match(result.error!, /ELEVENLABS_AGENT_ID/);
    }
  );
  assert.equal(called, false);
});

test("startBookingCall refuses a brief with no venue phone number", async () => {
  let called = false;
  await withMockFetch(
    async () => {
      called = true;
      return jsonResponse({});
    },
    async () => {
      const adapter = new RealBookingAgentAdapter(config);
      const result = await adapter.startBookingCall({ ...sampleBrief, venuePhoneNumber: "  " });
      assert.equal(result.status, "failed");
      assert.match(result.error!, /no venue phone number/);
    }
  );
  assert.equal(called, false);
});

test("getBookingCallStatus maps 'initiated' to pending", async () => {
  await withMockFetch(
    async (url) => {
      assert.equal(url, "https://api.elevenlabs.test/v1/convai/conversations/conv_1");
      return jsonResponse({ conversation_id: "conv_1", status: "initiated" });
    },
    async () => {
      const adapter = new RealBookingAgentAdapter(config);
      const result = await adapter.getBookingCallStatus("conv_1");
      assert.equal(result.status, "pending");
      assert.equal(result.externalId, "conv_1");
    }
  );
});

test("getBookingCallStatus maps 'in-progress' to in_progress and surfaces the partial transcript", async () => {
  await withMockFetch(
    async () =>
      jsonResponse({
        conversation_id: "conv_1",
        status: "in-progress",
        transcript: [
          { role: "agent", message: "Hi there!", time_in_call_secs: 2 },
          { role: "user", message: "One moment.", time_in_call_secs: 4 },
        ],
      }),
    async () => {
      const adapter = new RealBookingAgentAdapter(config);
      const result = await adapter.getBookingCallStatus("conv_1");
      assert.equal(result.status, "in_progress");
      assert.deepEqual(result.transcript, [
        { role: "agent", message: "Hi there!", atSeconds: 2 },
        { role: "user", message: "One moment.", atSeconds: 4 },
      ]);
    }
  );
});

test("getBookingCallStatus treats 'processing' as still in progress, not complete", async () => {
  await withMockFetch(
    async () => jsonResponse({ conversation_id: "conv_1", status: "processing" }),
    async () => {
      const adapter = new RealBookingAgentAdapter(config);
      const result = await adapter.getBookingCallStatus("conv_1");
      assert.equal(result.status, "in_progress");
      assert.equal(result.outcome, undefined);
    }
  );
});

test("getBookingCallStatus maps a done+confirmed call to completed/booked", async () => {
  await withMockFetch(
    async () =>
      jsonResponse({
        conversation_id: "conv_1",
        status: "done",
        metadata: { call_duration_secs: 74 },
        transcript: [{ role: "agent", message: "Confirmed, thank you!", time_in_call_secs: 70 }],
        analysis: {
          call_successful: "success",
          transcript_summary: "Table for 6 confirmed for Friday at 7pm.",
          data_collection_results: {
            booking_confirmed: { value: true },
            confirmed_time: { value: "2026-09-11T19:00:00-04:00" },
            confirmed_party_size: { value: 6 },
          },
        },
      }),
    async () => {
      const adapter = new RealBookingAgentAdapter(config);
      const result = await adapter.getBookingCallStatus("conv_1");
      assert.equal(result.status, "completed");
      assert.equal(result.outcome, "booked");
      assert.equal(result.confirmedTime, "2026-09-11T19:00:00-04:00");
      assert.equal(result.confirmedPartySize, 6);
      assert.equal(result.durationSeconds, 74);
      assert.match(result.summary!, /Table for 6 confirmed/);
    }
  );
});

test("an explicit booking_confirmed:false overrides call_successful:success", async () => {
  await withMockFetch(
    async () =>
      jsonResponse({
        conversation_id: "conv_1",
        status: "done",
        analysis: {
          call_successful: "success",
          data_collection_results: { booking_confirmed: { value: false } },
        },
      }),
    async () => {
      const adapter = new RealBookingAgentAdapter(config);
      const result = await adapter.getBookingCallStatus("conv_1");
      assert.equal(result.outcome, "declined");
    }
  );
});

test("a done call with no analysis is needs_followup, never booked", async () => {
  await withMockFetch(
    async () => jsonResponse({ conversation_id: "conv_1", status: "done" }),
    async () => {
      const adapter = new RealBookingAgentAdapter(config);
      const result = await adapter.getBookingCallStatus("conv_1");
      assert.equal(result.status, "completed");
      assert.equal(result.outcome, "needs_followup");
      assert.equal(result.confirmedTime, undefined);
    }
  );
});

test("call_successful:unknown maps to needs_followup, never booked", async () => {
  await withMockFetch(
    async () =>
      jsonResponse({
        conversation_id: "conv_1",
        status: "done",
        analysis: { call_successful: "unknown" },
      }),
    async () => {
      const adapter = new RealBookingAgentAdapter(config);
      const result = await adapter.getBookingCallStatus("conv_1");
      assert.equal(result.outcome, "needs_followup");
    }
  );
});

test("getBookingCallStatus maps provider status 'failed' to a failed result", async () => {
  await withMockFetch(
    async () => jsonResponse({ conversation_id: "conv_1", status: "failed" }),
    async () => {
      const adapter = new RealBookingAgentAdapter(config);
      const result = await adapter.getBookingCallStatus("conv_1");
      assert.equal(result.status, "failed");
      assert.ok(result.error);
    }
  );
});

test("an unknown provider status is treated as in progress, not terminal", async () => {
  await withMockFetch(
    async () => jsonResponse({ conversation_id: "conv_1", status: "something-new" }),
    async () => {
      const adapter = new RealBookingAgentAdapter(config);
      const result = await adapter.getBookingCallStatus("conv_1");
      assert.equal(result.status, "in_progress");
    }
  );
});

test("blank transcript messages are dropped", async () => {
  await withMockFetch(
    async () =>
      jsonResponse({
        conversation_id: "conv_1",
        status: "done",
        transcript: [
          { role: "agent", message: "  ", time_in_call_secs: 1 },
          { role: "agent", message: null, time_in_call_secs: 2 },
          { role: "user", message: "Real line", time_in_call_secs: 3 },
        ],
      }),
    async () => {
      const adapter = new RealBookingAgentAdapter(config);
      const result = await adapter.getBookingCallStatus("conv_1");
      assert.deepEqual(result.transcript, [
        { role: "user", message: "Real line", atSeconds: 3 },
      ]);
    }
  );
});

test("a non-2xx response becomes a controlled failed result, not a throw", async () => {
  await withMockFetch(
    async () => jsonResponse({ detail: "unauthorized" }, 401),
    async () => {
      const adapter = new RealBookingAgentAdapter(config);
      const result = await adapter.startBookingCall(sampleBrief);
      assert.equal(result.status, "failed");
      assert.match(result.error!, /401/);
    }
  );
});

test("a timeout becomes a controlled failed result, not a throw", async () => {
  const original = globalThis.fetch;
  // @ts-expect-error -- test double
  globalThis.fetch = async () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  };
  try {
    const adapter = new RealBookingAgentAdapter(config);
    const result = await adapter.startBookingCall(sampleBrief);
    assert.equal(result.status, "failed");
    assert.match(result.error!, /timed out/i);
  } finally {
    globalThis.fetch = original;
  }
});

test("the API key never appears in an error message", async () => {
  await withMockFetch(
    async () => jsonResponse({ detail: "nope" }, 500),
    async () => {
      const adapter = new RealBookingAgentAdapter(config);
      const result = await adapter.startBookingCall(sampleBrief);
      assert.doesNotMatch(result.error!, /test-key/);
    }
  );
});

test("a successful call where the venue said no is never reported as booked", async () => {
  // The exact shape that misreported a reservation: the call completed
  // cleanly (call_successful: "success") but the venue had no table, and the
  // agent has no booking_confirmed field configured to say so.
  await withMockFetch(
    async () =>
      jsonResponse({
        conversation_id: "conv_1",
        status: "done",
        transcript: [
          { role: "agent", message: "A table for six on Friday at seven?", time_in_call_secs: 3 },
          { role: "user", message: "We're completely booked Friday, sorry.", time_in_call_secs: 10 },
        ],
        analysis: {
          call_successful: "success",
          transcript_summary: "Venue is fully booked Friday.",
        },
      }),
    async () => {
      const adapter = new RealBookingAgentAdapter(config);
      const result = await adapter.getBookingCallStatus("conv_1");
      assert.equal(result.outcome, "needs_followup");
      assert.notEqual(result.outcome, "booked");
    }
  );
});
