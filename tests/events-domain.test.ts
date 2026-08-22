import assert from "node:assert/strict";
import test from "node:test";
import { buildEventLinks, createManagementToken, createPublicSlug } from "../src/features/events/ids.ts";
import { parseCreateEventInput } from "../src/features/events/validation.ts";

const valid = {
  title: "A cozy birthday dinner",
  description: "Warm lights, shared plates, and somewhere we can talk.",
  location: "West Toronto",
  groupSize: 6,
  priceMin: 35,
  priceMax: 65,
  timeOptions: [
    "2026-08-28T19:00:00.000Z",
    "2026-08-29T18:30:00.000Z",
  ],
};

test("accepts a complete event idea", () => {
  const result = parseCreateEventInput(valid);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value, valid);
});

test("rejects an empty event idea", () => {
  assert.deepEqual(parseCreateEventInput({ ...valid, description: "" }), {
    ok: false,
    error: "Describe the event idea.",
  });
});

test("requires a small-group size", () => {
  assert.deepEqual(parseCreateEventInput({ ...valid, groupSize: 1 }), {
    ok: false,
    error: "Group size must be between 2 and 30.",
  });
});

test("requires an ordered price range", () => {
  assert.deepEqual(
    parseCreateEventInput({ ...valid, priceMin: 80, priceMax: 40 }),
    {
      ok: false,
      error: "Maximum price must be at least the minimum price.",
    },
  );
});

test("requires at least one possible time", () => {
  assert.deepEqual(parseCreateEventInput({ ...valid, timeOptions: [] }), {
    ok: false,
    error: "Add at least one possible time.",
  });
});

test("builds distinct guest and management links", () => {
  assert.equal(createPublicSlug("A Cozy Dinner", "abc123"), "a-cozy-dinner-abc123");
  assert.equal(createManagementToken("secret-token"), "secret-token");
  assert.deepEqual(
    buildEventLinks("https://example.com", "cozy-abc123", "secret-token"),
    {
      guestUrl: "https://example.com/e/cozy-abc123",
      manageUrl: "https://example.com/manage/secret-token",
    },
  );
});
