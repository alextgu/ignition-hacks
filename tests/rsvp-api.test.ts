import assert from "node:assert/strict";
import test from "node:test";
import { createRsvpHandlers } from "../app/api/events/[slug]/rsvp/handler.ts";

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
  timeOptions: ["2026-08-28T19:00:00.000Z"],
  status: "coordinating" as const,
  worldStatus: "pending" as const,
  worldEmbedUrl: null,
  worldPreviewImageUrl: null,
  createdAt: "2026-08-22T12:00:00.000Z",
  updatedAt: "2026-08-22T12:00:00.000Z",
};

test("uses one guest identity for repeat RSVP updates", async () => {
  const guestIds: string[] = [];
  let displayName = "";
  const handlers = createRsvpHandlers(
    {
      async getGuestResponse() {
        return { event, attendee: null };
      },
      async upsertGuestResponse(_slug, guestId, input) {
        guestIds.push(guestId);
        displayName = (input as { displayName: string }).displayName;
        return {
          ok: true as const,
          attendee: {
            id: "attendee-1",
            eventId: event.id,
            guestId,
            displayName,
            selectedTimeOptions: event.timeOptions,
            priceResponse: "works" as const,
            avatarIndex: 0,
            createdAt: event.createdAt,
            updatedAt: event.updatedAt,
          },
        };
      },
    },
    () => "guest-secret",
  );
  const body = {
    displayName: "Alex",
    selectedTimeOptions: event.timeOptions,
    priceResponse: "works",
  };

  const first = await handlers.put(
    new Request("https://snapplan.test/api/events/demo-event/rsvp", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    "demo-event",
  );
  assert.equal(first.status, 200);
  const cookie = first.headers.get("set-cookie");
  assert.match(cookie ?? "", /^snapplan_guest_id=guest-secret;/);

  const second = await handlers.put(
    new Request("https://snapplan.test/api/events/demo-event/rsvp", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        cookie: "snapplan_guest_id=guest-secret",
      },
      body: JSON.stringify({ ...body, displayName: "Alex T." }),
    }),
    "demo-event",
  );
  assert.equal(second.status, 200);
  assert.deepEqual(guestIds, ["guest-secret", "guest-secret"]);
  assert.equal((await second.json()).attendee.displayName, "Alex T.");
});

test("returns not found for an unknown event", async () => {
  const handlers = createRsvpHandlers(
    {
      async getGuestResponse() {
        return null;
      },
      async upsertGuestResponse() {
        return { ok: false as const, error: "Event not found." };
      },
    },
    () => "guest-secret",
  );
  const response = await handlers.get(
    new Request("https://snapplan.test/api/events/missing/rsvp"),
    "missing",
  );
  assert.equal(response.status, 404);
});

test("returns public event details without exposing the management token", async () => {
  const handlers = createRsvpHandlers(
    {
      async getGuestResponse() {
        return { event, attendee: null };
      },
      async upsertGuestResponse() {
        return { ok: false as const, error: "Event not found." };
      },
    },
    () => "guest-secret",
  );

  const response = await handlers.get(
    new Request("https://snapplan.test/api/events/demo-event/rsvp"),
    "demo-event",
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.event.title, event.title);
  assert.equal(body.event.publicSlug, event.publicSlug);
  assert.equal(body.event.managementToken, undefined);
  assert.equal(body.attendee, null);
});

test("uses a named invitation as the stable RSVP identity", async () => {
  const guestIds: string[] = [];
  const handlers = createRsvpHandlers(
    {
      async resolveInvitation(_slug, token) {
        assert.equal(token, "invite-secret-1234");
        return {
          id: "invitation-1",
          eventId: event.id,
          token,
          suggestedName: "Alex",
          createdAt: event.createdAt,
        };
      },
      async getGuestResponse(_slug, guestId) {
        guestIds.push(guestId);
        return { event, attendee: null };
      },
      async upsertGuestResponse(_slug, guestId, input) {
        guestIds.push(guestId);
        return {
          ok: true as const,
          attendee: {
            id: "attendee-1",
            eventId: event.id,
            guestId,
            displayName: (input as { displayName: string }).displayName,
            selectedTimeOptions: event.timeOptions,
            priceResponse: "works" as const,
            avatarIndex: 0,
            createdAt: event.createdAt,
            updatedAt: event.updatedAt,
          },
        };
      },
    },
    () => "browser-guest",
  );
  const url =
    "https://snapplan.test/api/events/demo-event/rsvp?invite=invite-secret-1234";

  const getResponse = await handlers.get(new Request(url), "demo-event");
  assert.equal(getResponse.status, 200);
  const getBody = await getResponse.json();
  assert.equal(getBody.suggestedName, "Alex");
  assert.equal(getResponse.headers.get("set-cookie"), null);

  const putResponse = await handlers.put(
    new Request(url, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: "Alex T.",
        selectedTimeOptions: event.timeOptions,
        priceResponse: "works",
      }),
    }),
    "demo-event",
  );
  assert.equal(putResponse.status, 200);
  assert.deepEqual(guestIds, ["invite_invitation-1", "invite_invitation-1"]);
});
