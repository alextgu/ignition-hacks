import assert from "node:assert/strict";
import test from "node:test";
import { createManageHandler } from "../app/api/manage/[token]/handler.ts";
import { summarizeResponses } from "../src/features/events/summary.ts";

const event = {
  id: "event-1",
  publicSlug: "demo-event",
  managementToken: "manage-secret",
  title: "Demo event",
  description: "A demo dinner.",
  location: "Toronto",
  groupSize: 6,
  priceMin: 35,
  priceMax: 65,
  timeOptions: [
    "2026-08-28T19:00:00.000Z",
    "2026-08-29T18:30:00.000Z",
  ],
  status: "coordinating" as const,
  worldStatus: "pending" as const,
  worldEmbedUrl: null,
  worldPreviewImageUrl: null,
  createdAt: "2026-08-22T12:00:00.000Z",
  updatedAt: "2026-08-22T12:00:00.000Z",
};

const attendees = [
  {
    id: "attendee-1",
    eventId: event.id,
    guestId: "guest-1",
    displayName: "Alex",
    selectedTimeOptions: event.timeOptions,
    priceResponse: "works" as const,
    avatarIndex: 0,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  },
  {
    id: "attendee-2",
    eventId: event.id,
    guestId: "guest-2",
    displayName: "Sam",
    selectedTimeOptions: [event.timeOptions[0]],
    priceResponse: "flexible" as const,
    avatarIndex: 1,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  },
];

test("summarizes availability and price comfort", () => {
  const summary = summarizeResponses(event, attendees);
  assert.deepEqual(summary.priceCounts, {
    works: 1,
    flexible: 1,
    too_much: 0,
  });
  assert.deepEqual(summary.timeCounts, {
    [event.timeOptions[0]]: 2,
    [event.timeOptions[1]]: 1,
  });
  assert.equal(summary.responseCount, 2);
});

test("returns a private management payload without echoing the token", async () => {
  const handle = createManageHandler({
    async getManagedEvent() {
      return { event, attendees };
    },
  });
  const response = await handle(
    new Request("https://snapplan.test/api/manage/manage-secret"),
    "manage-secret",
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.guestUrl, "https://snapplan.test/e/demo-event");
  assert.equal(body.event.managementToken, undefined);
  assert.equal(body.summary.responseCount, 2);
});

test("returns not found for an unknown management token", async () => {
  const handle = createManageHandler({
    async getManagedEvent() {
      return null;
    },
  });
  const response = await handle(
    new Request("https://snapplan.test/api/manage/missing"),
    "missing",
  );
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Event not found." });
});
