import test from "node:test";
import assert from "node:assert/strict";
import { MockWorldLabsAdapter } from "../mockAdapter.ts";
import type { WorldSeed } from "../types.ts";

const seed: WorldSeed = {
  description: "a lakeside team offsite",
  eventType: "team offsite",
  mood: "energetic",
  location: "Muskoka",
  timeCharacter: "midday summer",
  groupSize: 12,
  priceCharacter: "splurge-worthy",
};

test("generateWorld resolves immediately with status ready", async () => {
  const adapter = new MockWorldLabsAdapter();
  const result = await adapter.generateWorld(seed);
  assert.equal(result.status, "ready");
  assert.ok(result.externalId, "expected an externalId to be returned");
  assert.ok(result.embedUrl?.startsWith("data:text/html;base64,"));
  assert.ok(result.previewImageUrl?.startsWith("data:image/svg+xml;base64,"));
});

test("generateWorld is deterministic for identical seeds", async () => {
  const adapter = new MockWorldLabsAdapter();
  const a = await adapter.generateWorld(seed);
  const b = await adapter.generateWorld({ ...seed });
  assert.deepEqual(a, b);
});

test("generateWorld differs for different seeds", async () => {
  const adapter = new MockWorldLabsAdapter();
  const a = await adapter.generateWorld(seed);
  const b = await adapter.generateWorld({ ...seed, mood: "cozy" });
  assert.notEqual(a.previewImageUrl, b.previewImageUrl);
  assert.notEqual(a.externalId, b.externalId);
});

test("getWorldStatus reproduces the same result from generateWorld's externalId", async () => {
  const adapter = new MockWorldLabsAdapter();
  const generated = await adapter.generateWorld(seed);
  const polled = await adapter.getWorldStatus(generated.externalId!);
  assert.deepEqual(polled, generated);
});

test("getWorldStatus fails cleanly for an unrecognized externalId", async () => {
  const adapter = new MockWorldLabsAdapter();
  const result = await adapter.getWorldStatus("not-a-real-id");
  assert.equal(result.status, "failed");
  assert.ok(result.error);
});

test("preview SVG embeds the seed's event type without throwing on special characters", async () => {
  const adapter = new MockWorldLabsAdapter();
  const result = await adapter.generateWorld({
    ...seed,
    eventType: `<script>alert("x")</script>`,
  });
  const svg = Buffer.from(
    result.previewImageUrl!.replace("data:image/svg+xml;base64,", ""),
    "base64"
  ).toString("utf8");
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;script&gt;/);
});
