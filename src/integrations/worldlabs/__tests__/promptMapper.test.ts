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

test("the host's own description and location survive into the prompt", () => {
  const prompt = buildWorldPrompt(baseSeed);
  assert.match(prompt, /a cozy birthday dinner with string lights/i);
  assert.match(prompt, /Toronto/);
});

test("event type becomes a miniature landmark on the planet surface", () => {
  assert.match(buildWorldPrompt(baseSeed), /dining pavilion/i);
  assert.match(
    buildWorldPrompt({ ...baseSeed, eventType: "corporate offsite" }),
    /meeting pavilion|boardroom table/i
  );
  assert.match(
    buildWorldPrompt({ ...baseSeed, eventType: "rooftop party" }),
    /terrace|dance platform/i
  );
});

test("the composition is a complete miniature planet seen from above", () => {
  const prompt = buildWorldPrompt(baseSeed);
  assert.match(prompt, /miniature floating event planetoid/i);
  assert.match(prompt, /entire (round|circular) silhouette/i);
  assert.match(prompt, /elevated three-quarter/i);
  assert.match(prompt, /angled down/i);
});

test("mood becomes light behaviour, not the emotion word", () => {
  const cozy = buildWorldPrompt(baseSeed);
  assert.match(cozy, /pools of light|candles|shadows/i);

  const lively = buildWorldPrompt({ ...baseSeed, mood: "energetic" });
  assert.match(lively, /bright even light|colour wash/i);
  // Marble can't render an emotion; the word itself must not be the instruction.
  assert.doesNotMatch(lively, /\benergetic\b/i);
});

test("price character becomes real materials", () => {
  assert.match(buildWorldPrompt(baseSeed), /oak|tile|brass/i);
  assert.match(
    buildWorldPrompt({ ...baseSeed, priceCharacter: "budget-friendly" }),
    /pine|painted brick|vinyl/i
  );
  assert.match(
    buildWorldPrompt({ ...baseSeed, priceCharacter: "splurge-worthy" }),
    /marble|walnut|velvet/i
  );
});

test("time character becomes the quality and direction of light", () => {
  assert.match(buildWorldPrompt(baseSeed), /golden sunlight|raking/i);
  assert.match(
    buildWorldPrompt({ ...baseSeed, timeCharacter: "late night" }),
    /deep night sky|lantern/i
  );
});

test("group size becomes concrete furniture, and scales", () => {
  assert.match(buildWorldPrompt({ ...baseSeed, groupSize: 2 }), /two-top/i);
  assert.match(buildWorldPrompt({ ...baseSeed, groupSize: 4 }), /four chairs/i);
  assert.match(buildWorldPrompt({ ...baseSeed, groupSize: 8 }), /8 chairs/);
  assert.match(buildWorldPrompt({ ...baseSeed, groupSize: 24 }), /end to end/i);
});

test("the planet is explicitly requested empty", () => {
  // Marble does not render human figures, and the app layers guest markers
  // over the scene, so asking for people wastes the generation.
  const prompt = buildWorldPrompt(baseSeed);
  assert.match(prompt, /unoccupied/i);
  assert.match(prompt, /no people/i);
});

test("the prompt carries a palette and a curved planetary boundary", () => {
  const prompt = buildWorldPrompt(baseSeed);
  assert.match(prompt, /palette of/i);
  assert.match(prompt, /curves away|curved edge/i);
  assert.match(prompt, /upper hemisphere/i);
  assert.match(prompt, /empty space around/i);
});

test("the prompt rejects the first-person interior composition", () => {
  const prompt = buildWorldPrompt(baseSeed);
  assert.match(prompt, /no interior room/i);
  assert.match(prompt, /no first-person/i);
  assert.match(prompt, /no close-up/i);
  assert.doesNotMatch(prompt, /restaurant dining room|ceiling overhead|through the windows/i);
});

test("text, signage and logos are excluded", () => {
  assert.match(buildWorldPrompt(baseSeed), /no text, no signage, no logos/i);
});

test("the prompt stays within Marble's 2000 character cap", () => {
  const long: WorldSeed = {
    ...baseSeed,
    description: "a ".repeat(1200),
    location: "x".repeat(300),
  };
  const prompt = buildWorldPrompt(long);
  assert.ok(prompt.length <= 2000, `was ${prompt.length}`);
  // Truncation must not leave a dangling half-clause.
  assert.ok(prompt.endsWith(".") || prompt.length < 2000);
});

test("buildWorldPrompt is deterministic", () => {
  assert.equal(buildWorldPrompt(baseSeed), buildWorldPrompt({ ...baseSeed }));
});

test("unknown or empty answers fall back without leaking placeholders", () => {
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
  assert.match(prompt, /a rooftop meetup/i);
  assert.match(prompt, /four chairs/i); // sane default group of 4
  assert.doesNotMatch(prompt, /undefined|null|NaN/);
  assert.ok(prompt.length > 200, "a sparse seed must still yield a usable prompt");
});

test("a group of one reads naturally", () => {
  assert.match(buildWorldPrompt({ ...baseSeed, groupSize: 1 }), /for 1 person\b/);
});

test("buildWorldDisplayName combines event type and location", () => {
  assert.equal(buildWorldDisplayName(baseSeed), "birthday dinner — Toronto");
  assert.equal(
    buildWorldDisplayName({ ...baseSeed, eventType: "", location: "" }),
    "Event"
  );
});
