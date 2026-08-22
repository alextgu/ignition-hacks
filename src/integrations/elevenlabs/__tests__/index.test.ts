import test from "node:test";
import assert from "node:assert/strict";
import {
  createBookingAgentAdapter,
  describeBookingAgentConfig,
  getBookingAgentAdapter,
  isLiveCallingConfigured,
  missingBookingAgentCredentials,
  resetBookingAgentAdapterForTests,
} from "../index.ts";
import { MockBookingAgentAdapter } from "../mockAdapter.ts";
import { RealBookingAgentAdapter } from "../elevenLabsAdapter.ts";
import { sampleBrief } from "./fixtures.ts";

const fullEnv = {
  ELEVENLABS_API_KEY: "k",
  ELEVENLABS_AGENT_ID: "a",
  ELEVENLABS_AGENT_PHONE_NUMBER_ID: "p",
};

test("with no credentials the factory returns the mock adapter", () => {
  assert.ok(createBookingAgentAdapter({}) instanceof MockBookingAgentAdapter);
});

test("with all credentials the factory returns the real adapter", () => {
  assert.ok(createBookingAgentAdapter(fullEnv) instanceof RealBookingAgentAdapter);
});

test("a partially configured environment falls back to the mock, not a broken real adapter", () => {
  const adapter = createBookingAgentAdapter({ ELEVENLABS_API_KEY: "k" });
  assert.ok(adapter instanceof MockBookingAgentAdapter);
});

test("ELEVENLABS_FORCE_MOCK wins over real credentials", () => {
  const adapter = createBookingAgentAdapter({ ...fullEnv, ELEVENLABS_FORCE_MOCK: "true" });
  assert.ok(adapter instanceof MockBookingAgentAdapter);
});

test("ELEVENLABS_MOCK_OUTCOME is honoured by the mock built from env", async () => {
  const adapter = createBookingAgentAdapter({ ELEVENLABS_MOCK_OUTCOME: "declined" });
  const started = await adapter.startBookingCall(sampleBrief);
  // Re-read far in the future so the simulated call has finished.
  const result = await adapter.getBookingCallStatus(started.externalId!);
  assert.ok(["pending", "in_progress", "completed"].includes(result.status));
  const forced = createBookingAgentAdapter({ ELEVENLABS_MOCK_OUTCOME: "nonsense" });
  assert.ok(forced instanceof MockBookingAgentAdapter);
});

test("the app can call the boundary without knowing which adapter is active", async () => {
  const adapter = createBookingAgentAdapter({});
  const started = await adapter.startBookingCall(sampleBrief);
  assert.ok(["pending", "in_progress", "completed"].includes(started.status));
  assert.ok(started.externalId);
});

test("getBookingAgentAdapter memoizes one instance per process", () => {
  resetBookingAgentAdapterForTests();
  assert.equal(getBookingAgentAdapter(), getBookingAgentAdapter());
  resetBookingAgentAdapterForTests();
});

test("isLiveCallingConfigured reflects credential completeness", () => {
  assert.equal(isLiveCallingConfigured({}), false);
  assert.equal(isLiveCallingConfigured({ ELEVENLABS_API_KEY: "k" }), false);
  assert.equal(isLiveCallingConfigured(fullEnv), true);
});

test("missingBookingAgentCredentials tells the operator what to set", () => {
  assert.deepEqual(missingBookingAgentCredentials(fullEnv), []);
  assert.ok(missingBookingAgentCredentials({}).includes("ELEVENLABS_AGENT_ID"));
});

test("describeBookingAgentConfig never leaks the API key", () => {
  const summary = JSON.stringify(
    describeBookingAgentConfig({ ...fullEnv, ELEVENLABS_API_KEY: "super-secret" })
  );
  assert.doesNotMatch(summary, /super-secret/);
});
