import assert from "node:assert/strict";
import test from "node:test";
import {
  describeConfig,
  loadConfig,
} from "../src/integrations/elevenlabs/config.ts";
import { verifyElevenLabsWebhook } from "../src/integrations/elevenlabs/webhook.ts";
import { createBookHandler } from "../app/api/manage/[token]/book/handler.ts";
import { createBookStatusHandler } from "../app/api/manage/[token]/book/status/handler.ts";
import { createElevenLabsWebhookHandler } from "../app/api/webhooks/elevenlabs/handler.ts";
import { resolveDestination } from "../src/features/booking/brief.ts";
import type {
  BookingAgentAdapter,
  BookingCallResult,
  EventBrief,
} from "../src/integrations/elevenlabs/types.ts";

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

const readyEnv = {
  ELEVENLABS_API_KEY: "key",
  ELEVENLABS_AGENT_ID: "agent_1",
  ELEVENLABS_PHONE_NUMBER_ID: "phone_1",
  ELEVENLABS_TEST_TO_NUMBER: "+15551234567",
  TWILIO_SID: "ACxxx",
  TWILIO_API_KEY: "secret",
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

function fakeAdapter(start: BookingCallResult): BookingAgentAdapter {
  return {
    async startBookingCall(brief: EventBrief) {
      assert.equal(brief.venuePhoneNumber, "+15551234567");
      return start;
    },
    async getBookingCallStatus(externalId: string) {
      return {
        status: "completed",
        externalId,
        outcome: "booked",
        summary: "Table confirmed.",
      };
    },
  };
}

test("reports Twilio and live-call readiness from env", () => {
  const incomplete = loadConfig({
    TWILIO_SID: "ACxxx",
    TWILIO_API_KEY: "secret",
  });
  const summary = describeConfig(incomplete);
  assert.equal(summary.usingRealAdapter, false);
  assert.equal(summary.twilioCredentialsConfigured, true);
  assert.deepEqual(summary.missingCredentials, [
    "ELEVENLABS_API_KEY",
    "ELEVENLABS_AGENT_ID",
    "ELEVENLABS_AGENT_PHONE_NUMBER_ID",
  ]);

  const ready = loadConfig(readyEnv);
  assert.equal(describeConfig(ready).usingRealAdapter, true);
  assert.equal(ready.testToNumber, "+15551234567");
});

test("blocks live destinations outside the test number without confirmation", () => {
  const blocked = resolveDestination({
    requestedToNumber: "+14165550123",
    testToNumber: "+15551234567",
    confirmRealVenue: false,
  });
  assert.equal(blocked.ok, false);

  const allowed = resolveDestination({
    requestedToNumber: "+14165550123",
    testToNumber: "+15551234567",
    confirmRealVenue: true,
  });
  assert.deepEqual(allowed, { ok: true, toNumber: "+14165550123" });
});

test("book endpoint defaults to dry run", async () => {
  const handle = createBookHandler(
    {
      getManagedEvent: async (token) =>
        token === "manage-secret" ? { event } : null,
    },
    { getEnv: () => readyEnv },
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
  assert.equal(body.readiness.twilioCredentialsConfigured, true);
});

test("live book endpoint dispatches through the booking adapter", async () => {
  const handle = createBookHandler(
    {
      getManagedEvent: async (token) =>
        token === "manage-secret" ? { event } : null,
    },
    {
      getEnv: () => readyEnv,
      createAdapter: () =>
        fakeAdapter({
          status: "pending",
          externalId: "conv_123",
        }),
    },
  );

  const response = await handle(
    new Request("https://snapplan.test/api/manage/manage-secret/book", {
      method: "POST",
      body: JSON.stringify({ live: true }),
    }),
    "manage-secret",
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.booking.mode, "live");
  assert.equal(body.booking.call.externalId, "conv_123");
  assert.equal(
    body.statusUrl,
    "/api/manage/manage-secret/book/status?callId=conv_123",
  );
});

test("book status endpoint polls the adapter", async () => {
  const handle = createBookStatusHandler(
    {
      getManagedEvent: async (token) =>
        token === "manage-secret" ? { event } : null,
    },
    {
      getEnv: () => readyEnv,
      createAdapter: () =>
        fakeAdapter({
          status: "pending",
          externalId: "conv_123",
        }),
    },
  );
  const response = await handle(
    new Request(
      "https://snapplan.test/api/manage/manage-secret/book/status?callId=conv_123",
    ),
    "manage-secret",
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.call.outcome, "booked");
});

test("book status endpoint rejects an invalid management token before polling", async () => {
  let polls = 0;
  const handle = createBookStatusHandler(
    {
      getManagedEvent: async () => null,
    },
    {
      getEnv: () => readyEnv,
      createAdapter: () => ({
        async startBookingCall() {
          return { status: "pending", externalId: "conv_123" };
        },
        async getBookingCallStatus() {
          polls += 1;
          return { status: "completed", outcome: "booked" };
        },
      }),
    },
  );

  const response = await handle(
    new Request(
      "https://snapplan.test/api/manage/not-valid/book/status?callId=conv_123",
    ),
    "not-valid",
  );

  assert.equal(response.status, 404);
  assert.equal(polls, 0);
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
