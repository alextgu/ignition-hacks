import assert from "node:assert/strict";
import test from "node:test";
import {
  bookingReadinessSummary,
  loadBookingConfig,
} from "../src/integrations/elevenlabs/config.ts";
import {
  OUTBOUND_CALL_URL,
  dispatchOutboundCall,
} from "../src/integrations/elevenlabs/outbound.ts";
import { verifyElevenLabsWebhook } from "../src/integrations/elevenlabs/webhook.ts";
import { createBookHandler } from "../app/api/manage/[token]/book/handler.ts";
import { createElevenLabsWebhookHandler } from "../app/api/webhooks/elevenlabs/handler.ts";

const event = {
  id: "event-1",
  publicSlug: "cozy-abc123",
  managementToken: "manage-secret",
  title: "Cozy dinner",
  description: "A cozy birthday dinner with shared plates.",
  location: "West Toronto",
  groupSize: 6,
  priceMin: 35,
  priceMax: 65,
  timeOptions: ["2026-08-28T19:00:00.000Z"],
  status: "coordinating" as const,
  worldStatus: "pending" as const,
  worldEmbedUrl: null,
  worldPreviewImageUrl: null,
  createdAt: "2026-08-22T12:00:00.000Z",
  updatedAt: "2026-08-22T12:00:00.000Z",
};

async function signBody(secret: string, timestamp: string, rawBody: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `t=${timestamp},v0=${hex}`;
}

test("reports live-call readiness from env", () => {
  const incomplete = loadBookingConfig({
    TWILIO_SID: "ACxxx",
    TWILIO_API_KEY: "secret",
  });
  assert.equal(incomplete.readyForLiveCall, false);
  assert.deepEqual(bookingReadinessSummary(incomplete).missingForLiveCall, [
    "ELEVENLABS_API_KEY",
    "ELEVENLABS_AGENT_ID",
    "ELEVENLABS_PHONE_NUMBER_ID",
    "ELEVENLABS_TEST_TO_NUMBER",
  ]);
  assert.equal(bookingReadinessSummary(incomplete).hasTwilioCredentials, true);

  const ready = loadBookingConfig({
    ELEVENLABS_API_KEY: "key",
    ELEVENLABS_AGENT_ID: "agent_1",
    ELEVENLABS_PHONE_NUMBER_ID: "phone_1",
    ELEVENLABS_TEST_TO_NUMBER: "+15551234567",
    TWILIO_SID: "ACxxx",
    TWILIO_API_KEY: "secret",
  });
  assert.equal(ready.readyForLiveCall, true);
});

test("dry-run outbound dispatch never calls ElevenLabs", async () => {
  let called = false;
  const result = await dispatchOutboundCall(
    loadBookingConfig({
      ELEVENLABS_API_KEY: "key",
      ELEVENLABS_AGENT_ID: "agent_1",
      ELEVENLABS_PHONE_NUMBER_ID: "phone_1",
      ELEVENLABS_TEST_TO_NUMBER: "+15551234567",
    }),
    { toNumber: "+15551234567" },
    {
      live: false,
      fetchImpl: async () => {
        called = true;
        return new Response("{}");
      },
    },
  );

  assert.equal(called, false);
  assert.deepEqual(result, {
    ok: true,
    mode: "dry_run",
    request: {
      agentId: "agent_1",
      phoneNumberId: "phone_1",
      toNumber: "+15551234567",
    },
  });
});

test("live outbound dispatch posts to ElevenLabs Twilio endpoint", async () => {
  const result = await dispatchOutboundCall(
    loadBookingConfig({
      ELEVENLABS_API_KEY: "key",
      ELEVENLABS_AGENT_ID: "agent_1",
      ELEVENLABS_PHONE_NUMBER_ID: "phone_1",
      ELEVENLABS_TEST_TO_NUMBER: "+15551234567",
    }),
    { toNumber: "+15551234567" },
    {
      live: true,
      fetchImpl: async (url, init) => {
        assert.equal(url, OUTBOUND_CALL_URL);
        assert.equal(init?.method, "POST");
        const headers = new Headers(init?.headers);
        assert.equal(headers.get("xi-api-key"), "key");
        assert.deepEqual(JSON.parse(String(init?.body)), {
          agent_id: "agent_1",
          agent_phone_number_id: "phone_1",
          to_number: "+15551234567",
        });
        return Response.json({
          success: true,
          message: "ok",
          conversation_id: "conv_1",
          callSid: "CA123",
        });
      },
    },
  );

  assert.deepEqual(result, {
    ok: true,
    mode: "live",
    conversationId: "conv_1",
    callSid: "CA123",
    message: "ok",
  });
});

test("book endpoint defaults to dry run", async () => {
  const handle = createBookHandler(
    {
      getManagedEvent: async (token) =>
        token === "manage-secret" ? { event } : null,
    },
    {
      getEnv: () => ({
        ELEVENLABS_API_KEY: "key",
        ELEVENLABS_AGENT_ID: "agent_1",
        ELEVENLABS_PHONE_NUMBER_ID: "phone_1",
        ELEVENLABS_TEST_TO_NUMBER: "+15551234567",
        TWILIO_SID: "ACxxx",
        TWILIO_API_KEY: "secret",
      }),
      fetchImpl: async () => {
        throw new Error("should not fetch");
      },
    },
  );

  const response = await handle(
    new Request("https://snapplan.test/api/manage/manage-secret/book", {
      method: "POST",
      body: "{}",
    }),
    "manage-secret",
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.booking.mode, "dry_run");
  assert.equal(body.readiness.hasTwilioCredentials, true);
});

test("verifies ElevenLabs webhook signatures", async () => {
  const secret = "whsec_test";
  const rawBody = JSON.stringify({ type: "post_call_transcription", data: {} });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await signBody(secret, timestamp, rawBody);

  const ok = await verifyElevenLabsWebhook(rawBody, signature, secret);
  assert.equal(ok.ok, true);

  const bad = await verifyElevenLabsWebhook(rawBody, signature, "other");
  assert.equal(bad.ok, false);
});

test("webhook handler rejects invalid signatures", async () => {
  const handle = createElevenLabsWebhookHandler({
    getEnv: () => ({ ELEVENLABS_WEBHOOK_SECRET: "whsec_test" }),
  });
  const response = await handle(
    new Request("https://snapplan.test/api/webhooks/elevenlabs", {
      method: "POST",
      headers: { "elevenlabs-signature": "t=1,v0=bad" },
      body: "{}",
    }),
  );
  assert.equal(response.status, 401);
});
