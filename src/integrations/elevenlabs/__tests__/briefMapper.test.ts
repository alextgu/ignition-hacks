import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCallScript,
  buildSystemPrompt,
  buildFirstMessage,
  buildDynamicVariables,
  formatIsoForSpeech,
} from "../briefMapper.ts";
import { sampleBrief } from "./fixtures.ts";
import type { EventBrief } from "../types.ts";

test("formatIsoForSpeech renders a speech-friendly local date and time", () => {
  assert.equal(
    formatIsoForSpeech("2026-09-11T19:00:00-04:00"),
    "Friday, September 11 at 7:00 PM"
  );
  assert.equal(
    formatIsoForSpeech("2026-09-12T19:30:00-04:00"),
    "Saturday, September 12 at 7:30 PM"
  );
  assert.equal(
    formatIsoForSpeech("2026-01-05T09:05:00-05:00"),
    "Monday, January 5 at 9:05 AM"
  );
  assert.equal(
    formatIsoForSpeech("2026-01-05T00:00:00-05:00"),
    "Monday, January 5 at 12:00 AM"
  );
  assert.equal(
    formatIsoForSpeech("2026-01-05T12:00:00-05:00"),
    "Monday, January 5 at 12:00 PM"
  );
});

test("formatIsoForSpeech is timezone-independent (reads the string's own wall time)", () => {
  // Same wall time, different offsets -> identical spoken text.
  assert.equal(
    formatIsoForSpeech("2026-09-11T19:00:00-04:00"),
    formatIsoForSpeech("2026-09-11T19:00:00+09:00")
  );
});

test("formatIsoForSpeech returns the input unchanged when unparseable", () => {
  assert.equal(formatIsoForSpeech("not-a-date"), "not-a-date");
});

test("system prompt carries the goal, party size, venue and primary time", () => {
  const prompt = buildSystemPrompt(sampleBrief);
  assert.match(prompt, /Osteria Rialto/);
  assert.match(prompt, /table for 6 people/);
  assert.match(prompt, /Friday, September 11 at 7:00 PM/);
  assert.match(prompt, /Simon/);
});

test("system prompt lists alternate windows in order", () => {
  const prompt = buildSystemPrompt(sampleBrief);
  assert.match(prompt, /alternatives in order: Saturday, September 12 at 7:30 PM/);
});

test("system prompt states the hard price ceiling and forbids payment details", () => {
  const prompt = buildSystemPrompt(sampleBrief);
  assert.match(prompt, /above 70 CAD per person/);
  assert.match(prompt, /Never provide credit card numbers/);
  assert.match(prompt, /Never agree to a non-refundable deposit/);
});

test("system prompt requires AI disclosure", () => {
  assert.match(buildSystemPrompt(sampleBrief), /you are an AI assistant/i);
  assert.match(buildSystemPrompt(sampleBrief), /Never claim to be a human/i);
});

test("system prompt forbids out-of-window times when the group is not flexible", () => {
  const strict: EventBrief = {
    ...sampleBrief,
    negotiation: { ...sampleBrief.negotiation, timeFlexible: false },
  };
  const prompt = buildSystemPrompt(strict);
  assert.match(prompt, /Do not accept a date or time outside the options/);
  assert.doesNotMatch(prompt, /minutes earlier or later/);
});

test("system prompt states the time tolerance when the group is flexible", () => {
  const prompt = buildSystemPrompt(sampleBrief);
  assert.match(prompt, /up to 30 minutes earlier or later/);
});

test("system prompt forbids split seating unless allowed", () => {
  assert.match(buildSystemPrompt(sampleBrief), /Do not accept split tables/);
  const relaxed: EventBrief = {
    ...sampleBrief,
    negotiation: { ...sampleBrief.negotiation, acceptSplitSeating: true },
  };
  assert.match(buildSystemPrompt(relaxed), /Split tables are acceptable/);
});

test("system prompt refuses to commit when no price ceiling was set", () => {
  const noCeiling: EventBrief = {
    ...sampleBrief,
    negotiation: { ...sampleBrief.negotiation, maxPricePerPerson: undefined },
  };
  const prompt = buildSystemPrompt(noCeiling);
  assert.match(prompt, /No price ceiling was set/);
  assert.match(prompt, /do not agree/i);
});

test("system prompt includes seating and dietary requests", () => {
  const prompt = buildSystemPrompt(sampleBrief);
  assert.match(prompt, /Ask for a quiet booth/);
  assert.match(prompt, /one vegan, no shellfish/);
});

test("system prompt includes voicemail handling with the callback number", () => {
  assert.match(buildSystemPrompt(sampleBrief), /voicemail/i);
  assert.match(buildSystemPrompt(sampleBrief), /\+14165559876/);
});

test("first message opens with the host, party size and time", () => {
  assert.equal(
    buildFirstMessage(sampleBrief),
    "Hi! I'm calling on behalf of Simon — I'd like to see if you have a table for 6 available Friday, September 11 at 7:00 PM."
  );
});

test("dynamic variables expose every brief field as a string", () => {
  const vars = buildDynamicVariables(sampleBrief);
  assert.equal(vars.venue_name, "Osteria Rialto");
  assert.equal(vars.party_size, "6");
  assert.equal(vars.host_name, "Simon");
  assert.equal(vars.primary_time, "Friday, September 11 at 7:00 PM");
  assert.equal(vars.alternate_times, "Saturday, September 12 at 7:30 PM");
  assert.equal(vars.max_price_per_person, "70 CAD");
  assert.equal(vars.dietary_notes, "one vegan, no shellfish");
  assert.equal(vars.time_flexible, "yes");
  assert.equal(vars.accept_split_seating, "no");
  for (const [key, value] of Object.entries(vars)) {
    assert.equal(typeof value, "string", `${key} must be a string`);
  }
});

test("buildCallScript is deterministic and pure", () => {
  assert.deepEqual(buildCallScript(sampleBrief), buildCallScript({ ...sampleBrief }));
});

test("a minimal brief produces a usable script with no undefined leaking in", () => {
  const minimal: EventBrief = {
    eventId: "evt_min",
    venueName: "The Corner",
    venuePhoneNumber: "+14165550000",
    location: "",
    partySize: 1,
    preferredWindows: [],
    hostName: "Alex",
    negotiation: { timeFlexible: false, acceptSplitSeating: false },
  };
  const script = buildCallScript(minimal);
  assert.doesNotMatch(script.systemPrompt, /undefined|null|NaN/);
  assert.doesNotMatch(script.firstMessage, /undefined|null|NaN/);
  assert.match(script.systemPrompt, /table for 1 person/);
  assert.match(script.firstMessage, /sometime soon/);
});
