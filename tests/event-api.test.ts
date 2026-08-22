import assert from "node:assert/strict";
import test from "node:test";
import { createEventHandler } from "../app/api/events/handler.ts";

const validInput = {
  title: "Cozy dinner",
  description: "A cozy birthday dinner with shared plates.",
  location: "West Toronto",
  groupSize: 6,
  priceMin: 35,
  priceMax: 65,
  timeOptions: ["2026-08-28T19:00:00.000Z"],
};

const event = {
  ...validInput,
  id: "event-1",
  publicSlug: "cozy-abc123",
  managementToken: "manage-secret",
  status: "coordinating" as const,
  worldStatus: "pending" as const,
  worldEmbedUrl: null,
  worldPreviewImageUrl: null,
  createdAt: "2026-08-22T12:00:00.000Z",
  updatedAt: "2026-08-22T12:00:00.000Z",
};

test("creates an event and returns both links", async () => {
  const handle = createEventHandler({
    createEvent: async () => ({ ok: true as const, event }),
  });
  const response = await handle(
    new Request("https://snapplan.test/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validInput),
    }),
  );

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.guestUrl, "https://snapplan.test/e/cozy-abc123");
  assert.equal(body.manageUrl, "https://snapplan.test/manage/manage-secret");
  assert.equal(body.event.publicSlug, "cozy-abc123");
});

test("returns a controlled error for malformed JSON", async () => {
  const handle = createEventHandler({
    createEvent: async () => ({ ok: true as const, event }),
  });
  const response = await handle(
    new Request("https://snapplan.test/api/events", {
      method: "POST",
      body: "{",
    }),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Send a valid event request.",
  });
});

test("preserves event validation messages", async () => {
  const handle = createEventHandler({
    createEvent: async () => ({
      ok: false as const,
      error: "Describe the event idea.",
    }),
  });
  const response = await handle(
    new Request("https://snapplan.test/api/events", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Describe the event idea.",
  });
});
