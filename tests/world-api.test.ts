import assert from "node:assert/strict";
import test from "node:test";
import type {
  AttendeeRecord,
  EventRecord,
  WorldStatePatch,
} from "../src/features/events/contracts.ts";
import type { WorldResult } from "../src/integrations/worldlabs/types.ts";
import { createWorldService } from "../src/features/world/service.ts";
import { createWorldStateHandler } from "../app/api/events/[slug]/world/handler.ts";
import { createEventHandler } from "../app/api/events/handler.ts";

const baseEvent: EventRecord = {
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
  status: "coordinating",
  worldStatus: "pending",
  worldEmbedUrl: null,
  worldPreviewImageUrl: null,
  createdAt: "2026-08-22T12:00:00.000Z",
  updatedAt: "2026-08-22T12:00:00.000Z",
};

type Harness = {
  events: EventRecord[];
  attendees: AttendeeRecord[];
  generateCalls: number;
  statusCalls: number;
  patches: WorldStatePatch[];
};

function setup(options: {
  event?: Partial<EventRecord>;
  generate?: WorldResult;
  status?: WorldResult;
  now?: () => string;
  live?: boolean;
}) {
  const harness: Harness = {
    events: [{ ...baseEvent, ...options.event }],
    attendees: [],
    generateCalls: 0,
    statusCalls: 0,
    patches: [],
  };

  const service = createWorldService({
    repository: {
      async findEventBySlug(slug) {
        return harness.events.find((e) => e.publicSlug === slug) ?? null;
      },
      async listAttendees() {
        return harness.attendees;
      },
      async updateWorldState(eventId, patch) {
        harness.patches.push(patch);
        const index = harness.events.findIndex((e) => e.id === eventId);
        if (index >= 0) harness.events[index] = { ...harness.events[index], ...patch };
      },
    },
    adapter: () => ({
      async generateWorld() {
        harness.generateCalls += 1;
        return options.generate ?? { status: "pending", externalId: "op-1" };
      },
      async getWorldStatus() {
        harness.statusCalls += 1;
        return options.status ?? { status: "pending", externalId: "op-1" };
      },
    }),
    now: options.now ?? (() => "2026-08-22T12:00:00.000Z"),
    isLive: () => options.live ?? false,
  });

  return { harness, service };
}

test("starts exactly one generation per event, however often it is asked", async () => {
  const { harness, service } = setup({});

  await service.startGeneration(harness.events[0]);
  assert.equal(harness.generateCalls, 1);
  assert.equal(harness.events[0].worldExternalId, "op-1");

  // Second attempt with the now-stored operation id must be a no-op.
  assert.equal(await service.startGeneration(harness.events[0]), null);
  assert.equal(harness.generateCalls, 1);
});

test("records a start attempt even when generation fails, so it is not retried forever", async () => {
  const { harness, service } = setup({
    generate: { status: "failed", error: "insufficient credits" },
  });

  await service.startGeneration(harness.events[0]);
  assert.equal(harness.events[0].worldStatus, "failed");
  assert.equal(harness.events[0].worldStartedAt, "2026-08-22T12:00:00.000Z");

  await service.ensureStarted(harness.events[0]);
  assert.equal(harness.generateCalls, 1);
});

test("polls a pending operation at most once per interval", async () => {
  let clock = Date.parse("2026-08-22T12:00:00.000Z");
  const { harness, service } = setup({
    event: {
      worldExternalId: "op-1",
      worldStartedAt: "2026-08-22T12:00:00.000Z",
      worldLastCheckedAt: "2026-08-22T12:00:00.000Z",
    },
    now: () => new Date(clock).toISOString(),
  });

  clock += 3_000;
  await service.refresh(harness.events[0]);
  assert.equal(harness.statusCalls, 0, "3s after the last check is too soon");

  clock += 8_000;
  await service.refresh(harness.events[0]);
  assert.equal(harness.statusCalls, 1, "11s after the last check is due");
});

test("a finished poll persists the world and stops polling", async () => {
  const { harness, service } = setup({
    event: { worldExternalId: "op-1", worldStartedAt: "2026-08-22T11:55:00.000Z" },
    status: {
      status: "ready",
      externalId: "op-1",
      embedUrl: "https://marble.worldlabs.ai/world/w1",
      assets: { panoUrl: "https://cdn.worldlabs.ai/w1/pano.jpg" },
    },
  });

  const refreshed = await service.refresh(harness.events[0]);
  assert.equal(refreshed.worldStatus, "ready");
  assert.equal(refreshed.worldPanoUrl, "https://cdn.worldlabs.ai/w1/pano.jpg");

  await service.refresh(refreshed);
  assert.equal(harness.statusCalls, 1, "a ready world is never polled again");
});

test("the world endpoint returns redacted state and 404s an unknown slug", async () => {
  const { harness, service } = setup({
    event: { worldExternalId: "op-1", worldStartedAt: "2026-08-22T12:00:00.000Z" },
  });
  harness.attendees.push({
    id: "a1",
    eventId: "event-1",
    guestId: "guest-secret",
    displayName: "Sam Okafor",
    selectedTimeOptions: ["2026-08-28T19:00:00.000Z"],
    priceResponse: "works",
    avatarIndex: 2,
    createdAt: "2026-08-22T13:00:00.000Z",
    updatedAt: "2026-08-22T13:00:00.000Z",
  });

  const handle = createWorldStateHandler(service);
  const response = await handle(
    new Request("https://snapplan.test/api/events/cozy-abc123/world"),
    "cozy-abc123",
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.text();
  assert.doesNotMatch(body, /manage-secret/);
  assert.doesNotMatch(body, /guest-secret/);
  assert.doesNotMatch(body, /op-1/);
  assert.match(body, /"label":"Sam"/);
  // Without a configured key the canvas must not claim a generated world.
  assert.match(body, /"live":false/);

  const missing = await handle(
    new Request("https://snapplan.test/api/events/nope/world"),
    "nope",
  );
  assert.equal(missing.status, 404);
});

test("a configured key is what flips the canvas to a live World Labs label", async () => {
  const { service } = setup({
    event: { worldExternalId: "op-1", worldStartedAt: "2026-08-22T12:00:00.000Z" },
    live: true,
  });
  const state = await service.getPublicState("cozy-abc123");
  assert.equal(state?.world.live, true);
});

test("the world endpoint fails closed rather than leaking an internal error", async () => {
  const handle = createWorldStateHandler({
    async getPublicState() {
      throw new Error("D1 binding DB is unavailable at table events");
    },
  });
  const response = await handle(
    new Request("https://snapplan.test/api/events/cozy-abc123/world"),
    "cozy-abc123",
  );
  assert.equal(response.status, 500);
  const body = await response.text();
  assert.doesNotMatch(body, /D1 binding/);
});

test("event creation still succeeds and returns links when world generation throws", async () => {
  const handle = createEventHandler(
    { createEvent: async () => ({ ok: true as const, event: baseEvent }) },
    {
      onEventCreated: async () => {
        throw new Error("World Labs is on fire");
      },
    },
  );

  const response = await handle(
    new Request("https://snapplan.test/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: "anything" }),
    }),
  );

  assert.equal(response.status, 201);
  const body = (await response.json()) as { worldUrl: string; guestUrl: string };
  assert.equal(body.worldUrl, "https://snapplan.test/world/cozy-abc123");
  assert.equal(body.guestUrl, "https://snapplan.test/e/cozy-abc123");
});
