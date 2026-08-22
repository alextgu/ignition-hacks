import test from "node:test";
import assert from "node:assert/strict";
import { buildWorldPrompt, buildWorldDisplayName } from "../promptMapper.ts";
import type { WorldSeed } from "../types.ts";

const baseSeed: WorldSeed = {
  description: "a cozy birthday dinner with string lights",
  eventType: "birthday dinner",
  mood: "cozy",
  location: "Toronto",
  timeCharacter: "golden hour",
  groupSize: 8,
  priceCharacter: "mid-range",
};

test("buildWorldPrompt includes every WorldSeed field", () => {
  const prompt = buildWorldPrompt(baseSeed);
  assert.match(prompt, /cozy birthday dinner scene/i);
  assert.match(prompt, /a cozy birthday dinner with string lights/);
  assert.match(prompt, /Toronto/);
  assert.match(prompt, /golden hour/);
  assert.match(prompt, /group of about 8 people/);
  assert.match(prompt, /mid-range/);
});

test("buildWorldPrompt is deterministic for the same seed", () => {
  assert.equal(buildWorldPrompt(baseSeed), buildWorldPrompt({ ...baseSeed }));
});

test("buildWorldPrompt tolerates missing optional fields", () => {
  const sparse: WorldSeed = {
    description: "a rooftop meetup",
    eventType: "",
    mood: "",
    location: "",
    timeCharacter: "",
    groupSize: 0,
    priceCharacter: "",
  };
  const prompt = buildWorldPrompt(sparse);
  assert.match(prompt, /a rooftop meetup/);
  assert.match(prompt, /group of about 4 people/); // falls back to a sane default
  assert.doesNotMatch(prompt, /\bundefined\b/);
  assert.doesNotMatch(prompt, /\bnull\b/);
});

test("buildWorldPrompt singularizes a group of one", () => {
  const prompt = buildWorldPrompt({ ...baseSeed, groupSize: 1 });
  assert.match(prompt, /group of about 1 person\b/);
});

test("buildWorldDisplayName combines event type and location", () => {
  assert.equal(buildWorldDisplayName(baseSeed), "birthday dinner — Toronto");
});

test("buildWorldDisplayName falls back to a generic label", () => {
  assert.equal(
    buildWorldDisplayName({ ...baseSeed, eventType: "", location: "" }),
    "Event"
  );
});
