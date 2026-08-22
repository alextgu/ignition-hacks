import assert from "node:assert/strict";
import test from "node:test";
import type { AttendeeRecord, EventRecord } from "../src/features/events/contracts.ts";
import type { EventsRepository } from "../src/features/events/repository.ts";
import { createEventService } from "../src/features/events/service.ts";

function createMemoryRepository(): EventsRepository {
  const events: EventRecord[] = [];
  const attendees: AttendeeRecord[] = [];
  const invitations: Array<{
    id: string;
    eventId: string;
    token: string;
    suggestedName: string;
    createdAt: string;
  }> = [];

  return {
    async insertEvent(event) {
      events.push(structuredClone(event));
    },
    async findEventBySlug(slug) {
      return structuredClone(events.find((event) => event.publicSlug === slug) ?? null);
    },
    async findEventByManagementToken(token) {
      return structuredClone(
        events.find((event) => event.managementToken === token) ?? null,
      );
    },
    async findAttendee(eventId, guestId) {
      return structuredClone(
        attendees.find(
          (attendee) => attendee.eventId === eventId && attendee.guestId === guestId,
        ) ?? null,
      );
    },
    async listAttendees(eventId) {
      return structuredClone(
        attendees.filter((attendee) => attendee.eventId === eventId),
      );
    },
    async upsertAttendee(attendee) {
      const index = attendees.findIndex(
        (candidate) =>
          candidate.eventId === attendee.eventId &&
          candidate.guestId === attendee.guestId,
      );
      if (index === -1) attendees.push(structuredClone(attendee));
      else attendees[index] = structuredClone(attendee);
      return structuredClone(attendee);
    },
    async insertInvitations(records) {
      invitations.push(...structuredClone(records));
      return structuredClone(records);
    },
    async findInvitation(eventId, token) {
      return structuredClone(
        invitations.find(
          (invitation) =>
            invitation.eventId === eventId && invitation.token === token,
        ) ?? null,
      );
    },
    async listInvitations(eventId) {
      return structuredClone(
        invitations.filter((invitation) => invitation.eventId === eventId),
      );
    },
  };
}

const validInput = {
  title: "Cozy dinner",
  description: "A cozy birthday dinner with shared plates.",
  location: "West Toronto",
  groupSize: 6,
  priceMin: 35,
  priceMax: 65,
  timeOptions: [
    "2026-08-28T19:00:00.000Z",
    "2026-08-29T18:30:00.000Z",
  ],
};

function setup() {
  let id = 0;
  const service = createEventService(createMemoryRepository(), {
    newId: () => `id-${++id}`,
    newPublicSlug: () => "cozy-abc123",
    newManagementToken: () => "manage-secret",
    newInvitationToken: () => `invite-secret-${++id}`,
    now: () => "2026-08-22T12:00:00.000Z",
  });
  return service;
}

test("creates an event with distinct public and private identifiers", async () => {
  const result = await setup().createEvent(validInput);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.event.status, "coordinating");
  assert.equal(result.event.publicSlug, "cozy-abc123");
  assert.equal(result.event.managementToken, "manage-secret");
  assert.notEqual(result.event.publicSlug, result.event.managementToken);
});

test("updates one attendee record for repeat submissions by the same guest", async () => {
  const service = setup();
  const created = await service.createEvent(validInput);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const first = await service.upsertGuestResponse(
    created.event.publicSlug,
    "guest-a",
    {
      displayName: "Alex",
      selectedTimeOptions: [validInput.timeOptions[0]],
      priceResponse: "works",
    },
  );
  assert.equal(first.ok, true);

  const second = await service.upsertGuestResponse(
    created.event.publicSlug,
    "guest-a",
    {
      displayName: "Alex T.",
      selectedTimeOptions: validInput.timeOptions,
      priceResponse: "flexible",
    },
  );
  assert.equal(second.ok, true);

  const managed = await service.getManagedEvent(created.event.managementToken);
  assert.ok(managed);
  assert.equal(managed.attendees.length, 1);
  assert.equal(managed.attendees[0].displayName, "Alex T.");
  assert.equal(managed.attendees[0].priceResponse, "flexible");
});

test("rejects a guest time that the host did not offer", async () => {
  const service = setup();
  const created = await service.createEvent(validInput);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  assert.deepEqual(
    await service.upsertGuestResponse(created.event.publicSlug, "guest-a", {
      displayName: "Alex",
      selectedTimeOptions: ["2027-01-01T12:00:00.000Z"],
      priceResponse: "works",
    }),
    { ok: false, error: "Choose a time offered by this event." },
  );
});

test("returns null for an unknown public event", async () => {
  assert.equal(await setup().getEventBySlug("missing"), null);
});

test("creates named invitations that the host can recover", async () => {
  const service = setup();
  const created = await service.createEvent(validInput);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const createInvitations = (
    service as typeof service & {
      createInvitations(
        managementToken: string,
        input: unknown,
      ): Promise<{
        ok: true;
        invitations: Array<{ token: string; suggestedName: string }>;
      }>;
    }
  ).createInvitations;
  assert.equal(typeof createInvitations, "function");

  const result = await createInvitations.call(
    service,
    created.event.managementToken,
    { names: [" Alex ", "Sam"] },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.invitations.map(({ suggestedName }) => suggestedName),
    ["Alex", "Sam"],
  );
  assert.equal(new Set(result.invitations.map(({ token }) => token)).size, 2);

  const managed = await service.getManagedEvent(created.event.managementToken);
  assert.ok(managed);
  assert.deepEqual(
    managed.invitations.map(({ suggestedName }) => suggestedName),
    ["Alex", "Sam"],
  );
});
