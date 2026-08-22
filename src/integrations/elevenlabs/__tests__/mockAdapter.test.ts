import test from "node:test";
import assert from "node:assert/strict";
import { MockBookingAgentAdapter } from "../mockAdapter.ts";
import { sampleBrief } from "./fixtures.ts";
import type { EventBrief } from "../types.ts";

/** Fixed clock so the simulated call progression is fully deterministic. */
const T0 = 1_770_000_000_000;
function clockAt(offsetSeconds: number) {
  return () => T0 + offsetSeconds * 1000;
}

test("startBookingCall returns pending with a pollable externalId and places no call", async () => {
  const original = globalThis.fetch;
  let fetchCalled = false;
  // @ts-expect-error -- test double
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response("{}");
  };
  try {
    const adapter = new MockBookingAgentAdapter({ now: clockAt(0) });
    const result = await adapter.startBookingCall(sampleBrief);
    assert.equal(result.status, "pending");
    assert.ok(result.externalId?.startsWith("mock-call:"));
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(fetchCalled, false, "the mock must never touch the network");
});

test("the simulated call progresses pending -> in_progress -> completed over time", async () => {
  const start = new MockBookingAgentAdapter({ now: clockAt(0) });
  const id = (await start.startBookingCall(sampleBrief)).externalId!;

  const atStart = await new MockBookingAgentAdapter({ now: clockAt(0) }).getBookingCallStatus(id);
  assert.equal(atStart.status, "pending");

  const midCall = await new MockBookingAgentAdapter({ now: clockAt(6) }).getBookingCallStatus(id);
  assert.equal(midCall.status, "in_progress");
  assert.ok(midCall.transcript!.length > 0);

  const finished = await new MockBookingAgentAdapter({ now: clockAt(30) }).getBookingCallStatus(id);
  assert.equal(finished.status, "completed");
});

test("the transcript is revealed progressively during the call", async () => {
  const id = (await new MockBookingAgentAdapter({ now: clockAt(0) }).startBookingCall(sampleBrief))
    .externalId!;

  const early = await new MockBookingAgentAdapter({ now: clockAt(5) }).getBookingCallStatus(id);
  const later = await new MockBookingAgentAdapter({ now: clockAt(10) }).getBookingCallStatus(id);

  assert.ok(early.transcript!.length < later.transcript!.length);
  for (const line of early.transcript!) {
    assert.ok(line.atSeconds <= 5);
  }
});

test("a completed happy-path call is booked with a confirmed time and party size", async () => {
  const id = (await new MockBookingAgentAdapter({ now: clockAt(0) }).startBookingCall(sampleBrief))
    .externalId!;
  const result = await new MockBookingAgentAdapter({ now: clockAt(60) }).getBookingCallStatus(id);

  assert.equal(result.status, "completed");
  assert.equal(result.outcome, "booked");
  assert.equal(result.confirmedTime, "2026-09-11T19:00:00-04:00");
  assert.equal(result.confirmedPartySize, 6);
  assert.match(result.summary!, /Osteria Rialto confirmed a table for 6/);
});

test("the mock transcript reflects the real brief, not a canned script", async () => {
  const id = (await new MockBookingAgentAdapter({ now: clockAt(0) }).startBookingCall(sampleBrief))
    .externalId!;
  const result = await new MockBookingAgentAdapter({ now: clockAt(60) }).getBookingCallStatus(id);
  const joined = result.transcript!.map((l) => l.message).join(" ");

  assert.match(joined, /Osteria Rialto/);
  assert.match(joined, /Simon/);
  assert.match(joined, /table for 6/);
  assert.match(joined, /Friday, September 11 at 7:00 PM/);
  assert.match(joined, /one vegan and no shellfish/);
});

test("results are deterministic for the same externalId", async () => {
  const id = (await new MockBookingAgentAdapter({ now: clockAt(0) }).startBookingCall(sampleBrief))
    .externalId!;
  const a = await new MockBookingAgentAdapter({ now: clockAt(60) }).getBookingCallStatus(id);
  const b = await new MockBookingAgentAdapter({ now: clockAt(60) }).getBookingCallStatus(id);
  assert.deepEqual(a, b);
});

test("forcedOutcome drives the declined path for demoing graceful failure", async () => {
  const id = (await new MockBookingAgentAdapter({ now: clockAt(0) }).startBookingCall(sampleBrief))
    .externalId!;
  const result = await new MockBookingAgentAdapter({
    now: clockAt(60),
    forcedOutcome: "declined",
  }).getBookingCallStatus(id);

  assert.equal(result.outcome, "declined");
  assert.equal(result.confirmedTime, undefined);
  assert.match(result.summary!, /could not accommodate/);
  assert.match(result.transcript!.map((l) => l.message).join(" "), /fully committed/);
});

test("forcedOutcome drives the needs_followup path", async () => {
  const id = (await new MockBookingAgentAdapter({ now: clockAt(0) }).startBookingCall(sampleBrief))
    .externalId!;
  const result = await new MockBookingAgentAdapter({
    now: clockAt(60),
    forcedOutcome: "needs_followup",
  }).getBookingCallStatus(id);

  assert.equal(result.outcome, "needs_followup");
  assert.equal(result.confirmedTime, undefined);
  assert.match(result.summary!, /outside the approved range/);
});

test("a brief with no proposed windows is never reported as booked", async () => {
  const noWindows: EventBrief = { ...sampleBrief, preferredWindows: [] };
  const id = (await new MockBookingAgentAdapter({ now: clockAt(0) }).startBookingCall(noWindows))
    .externalId!;
  const result = await new MockBookingAgentAdapter({ now: clockAt(60) }).getBookingCallStatus(id);

  assert.equal(result.outcome, "needs_followup");
  assert.equal(result.confirmedTime, undefined);
});

test("getBookingCallStatus fails cleanly on an unrecognized externalId", async () => {
  const adapter = new MockBookingAgentAdapter({ now: clockAt(0) });
  const result = await adapter.getBookingCallStatus("conv_real_looking_id");
  assert.equal(result.status, "failed");
  assert.ok(result.error);
});

test("the mock survives a process restart (no in-memory state)", async () => {
  // Mint the id with one instance, read it back with a completely separate
  // one — mirrors a serverless invocation boundary.
  const id = (await new MockBookingAgentAdapter({ now: clockAt(0) }).startBookingCall(sampleBrief))
    .externalId!;
  const fresh = new MockBookingAgentAdapter({ now: clockAt(60) });
  const result = await fresh.getBookingCallStatus(id);
  assert.equal(result.status, "completed");
  assert.equal(result.outcome, "booked");
});
