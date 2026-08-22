import assert from "node:assert/strict";
import test from "node:test";
import type { AttendeeRecord, EventRecord } from "../src/features/events/contracts.ts";
import {
  buildWorldSeed,
  describePrice,
  describeTime,
  redactCreativeText,
} from "../src/features/world/seed.ts";
import { buildPublicWorldState, deriveStage } from "../src/features/world/state.ts";
import { worldResultToPatch } from "../src/features/world/service.ts";

const event: EventRecord = {
  id: "event-1",
  publicSlug: "cozy-abc123",
  managementToken: "manage-secret",
  title: "Priya's birthday dinner",
  description: "A cozy birthday dinner with shared plates somewhere warm.",
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

function attendee(overrides: Partial<AttendeeRecord>): AttendeeRecord {
  return {
    id: "attendee-1",
    eventId: "event-1",
    guestId: "guest-1",
    displayName: "Sam Okafor",
    selectedTimeOptions: ["2026-08-28T19:00:00.000Z"],
    priceResponse: "works",
    avatarIndex: 0,
    createdAt: "2026-08-22T13:00:00.000Z",
    updatedAt: "2026-08-22T13:00:00.000Z",
    ...overrides,
  };
}

test("strips contact details out of host-authored text", () => {
  const redacted = redactCreativeText(
    "Dinner at Joe's, call +1 (416) 555-0134 or email me at host@example.com, menu at joespizza.com or https://joes.example/menu, dm @joespizza",
  );
  assert.doesNotMatch(redacted, /@example\.com/);
  assert.doesNotMatch(redacted, /555/);
  assert.doesNotMatch(redacted, /joespizza\.com/);
  assert.doesNotMatch(redacted, /https?:/);
  assert.doesNotMatch(redacted, /@joespizza/);
  // The creative part has to survive, or there is nothing to generate from.
  assert.match(redacted, /Dinner at Joe's/);
});

test("keeps attendee-identifying fields out of the world seed entirely", () => {
  const seed = buildWorldSeed(event);
  const serialized = JSON.stringify(seed);
  // The title is excluded on purpose: hosts put people's names in titles.
  assert.doesNotMatch(serialized, /Priya/);
  assert.doesNotMatch(serialized, /manage-secret/);
  assert.doesNotMatch(serialized, /cozy-abc123/);
});

test("translates the event into renderable seed character", () => {
  const seed = buildWorldSeed(event);
  assert.equal(seed.eventType, "birthday dinner");
  assert.equal(seed.mood, "cozy");
  assert.equal(seed.priceCharacter, "mid-range");
  assert.equal(seed.groupSize, 6);
  assert.match(seed.timeCharacter, /golden hour/);
});

test("prices map onto three bands", () => {
  assert.equal(describePrice(18), "budget-friendly");
  assert.equal(describePrice(65), "mid-range");
  assert.equal(describePrice(140), "splurge-worthy");
  assert.equal(describePrice(Number.NaN), "mid-range");
});

test("time character falls back when every option is unparseable", () => {
  assert.equal(describeTime(["not a date"]), "early evening");
  assert.match(describeTime(["2026-01-14T23:30:00.000Z"]), /late night/);
});

test("outdoor events request the larger model", () => {
  const picnic = buildWorldSeed({
    ...event,
    description: "A picnic in the park with everyone bringing something.",
  });
  assert.equal(picnic.expansive, true);
  assert.equal(buildWorldSeed(event).expansive, false);
});

test("stage follows attendees and event status", () => {
  assert.equal(deriveStage({ attendeeCount: 0, eventStatus: "coordinating" }), "seed");
  assert.equal(deriveStage({ attendeeCount: 3, eventStatus: "coordinating" }), "gathering");
  assert.equal(deriveStage({ attendeeCount: 3, eventStatus: "ready" }), "ready");
  assert.equal(
    deriveStage({ attendeeCount: 3, eventStatus: "ready", bookingConfirmed: true }),
    "booked",
  );
});

test("public world state never exposes private event or guest fields", () => {
  const state = buildPublicWorldState(
    {
      ...event,
      worldStatus: "ready",
      worldExternalId: "operation-abc",
      worldError: "some upstream detail",
      worldEmbedUrl: "https://marble.worldlabs.ai/world/w1",
      worldPanoUrl: "https://cdn.worldlabs.ai/w1/pano.jpg",
      worldStartedAt: "2026-08-22T12:00:00.000Z",
    },
    [attendee({})],
    "2026-08-22T12:05:00.000Z",
  );

  const serialized = JSON.stringify(state);
  assert.doesNotMatch(serialized, /manage-secret/);
  assert.doesNotMatch(serialized, /operation-abc/);
  assert.doesNotMatch(serialized, /some upstream detail/);
  assert.doesNotMatch(serialized, /guest-1/);
  // Only a first name reaches the canvas label.
  assert.doesNotMatch(serialized, /Okafor/);
  assert.equal(state.presentation.attendees[0].label, "Sam");
  assert.equal(state.world.elapsedSeconds, 300);
});

test("attendees keep a stable order so lanterns do not jump between polls", () => {
  const state = buildPublicWorldState(
    event,
    [
      attendee({ id: "b", guestId: "g2", displayName: "Zoe", createdAt: "2026-08-22T14:00:00.000Z" }),
      attendee({ id: "a", guestId: "g1", displayName: "Ada", createdAt: "2026-08-22T13:00:00.000Z" }),
    ],
    "2026-08-22T15:00:00.000Z",
  );
  assert.deepEqual(
    state.presentation.attendees.map((a) => a.label),
    ["Ada", "Zoe"],
  );
});

test("a ready result persists every render asset", () => {
  const patch = worldResultToPatch(
    {
      status: "ready",
      externalId: "op-1",
      embedUrl: "https://marble.worldlabs.ai/world/w1",
      previewImageUrl: "https://cdn.worldlabs.ai/w1/thumb.jpg",
      assets: {
        panoUrl: "https://cdn.worldlabs.ai/w1/pano.jpg",
        splatUrls: { low: "low.spz", medium: "medium.spz", full: "full.spz" },
        caption: "A warm dining room",
      },
    },
    "2026-08-22T12:05:00.000Z",
  );

  assert.equal(patch.worldStatus, "ready");
  assert.equal(patch.worldPanoUrl, "https://cdn.worldlabs.ai/w1/pano.jpg");
  assert.equal(patch.worldSplatLowUrl, "low.spz");
  assert.equal(patch.worldSplatMediumUrl, "medium.spz");
  assert.equal(patch.worldCaption, "A warm dining room");
  assert.equal(patch.worldError, null);
  assert.equal(patch.worldCompletedAt, "2026-08-22T12:05:00.000Z");
});

test("a failed result stores the reason and stops the clock", () => {
  const patch = worldResultToPatch(
    { status: "failed", externalId: "op-1", error: "insufficient credits" },
    "2026-08-22T12:05:00.000Z",
  );
  assert.equal(patch.worldStatus, "failed");
  assert.equal(patch.worldError, "insufficient credits");
  assert.equal(patch.worldCompletedAt, "2026-08-22T12:05:00.000Z");
});

test("a world produced by the offline fallback is never labelled live", () => {
  const fallbackEvent: EventRecord = {
    ...event,
    worldStatus: "ready",
    // What the deterministic adapter stores when there is no API key.
    worldEmbedUrl: "data:text/html;base64,PGh0bWw+",
    worldPreviewImageUrl: "data:image/svg+xml;base64,PHN2Zz4=",
  };

  // Even with a key configured now, a world generated without one must not
  // claim to be a World Labs world.
  const state = buildPublicWorldState(fallbackEvent, [], "2026-08-22T12:00:00.000Z", true);
  assert.equal(state.world.live, false);

  const realEvent: EventRecord = {
    ...event,
    worldStatus: "ready",
    worldEmbedUrl: "https://marble.worldlabs.ai/world/w1",
    worldPreviewImageUrl: "https://cdn.worldlabs.ai/w1/thumb.jpg",
  };
  assert.equal(
    buildPublicWorldState(realEvent, [], "2026-08-22T12:00:00.000Z", true).world.live,
    true,
  );
});
