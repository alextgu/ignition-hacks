import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig, shouldUseRealAdapter, missingCredentials, describeConfig } from "../config.ts";

const fullEnv = {
  ELEVENLABS_API_KEY: "k",
  ELEVENLABS_AGENT_ID: "a",
  ELEVENLABS_AGENT_PHONE_NUMBER_ID: "p",
};

test("loadConfig applies sane defaults with nothing set", () => {
  const config = loadConfig({});
  assert.equal(config.apiKey, undefined);
  assert.equal(config.baseUrl, "https://api.elevenlabs.io");
  assert.equal(config.timeoutMs, 15_000);
  assert.equal(config.usePromptOverride, true);
  assert.equal(config.callRecordingEnabled, false);
  assert.equal(config.forceMock, false);
});

test("loadConfig reads every variable and trims secrets", () => {
  const config = loadConfig({
    ...fullEnv,
    ELEVENLABS_API_KEY: "  spaced-key  ",
    ELEVENLABS_BASE_URL: "https://staging.elevenlabs.example",
    ELEVENLABS_TIMEOUT_MS: "30000",
    ELEVENLABS_USE_PROMPT_OVERRIDE: "false",
    ELEVENLABS_CALL_RECORDING_ENABLED: "true",
    ELEVENLABS_MOCK_OUTCOME: "declined",
  });
  assert.equal(config.apiKey, "spaced-key");
  assert.equal(config.baseUrl, "https://staging.elevenlabs.example");
  assert.equal(config.timeoutMs, 30_000);
  assert.equal(config.usePromptOverride, false);
  assert.equal(config.callRecordingEnabled, true);
  assert.equal(config.mockOutcome, "declined");
});

test("all three credentials are required for the real adapter", () => {
  assert.equal(shouldUseRealAdapter(loadConfig(fullEnv)), true);
  assert.equal(
    shouldUseRealAdapter(loadConfig({ ...fullEnv, ELEVENLABS_AGENT_ID: "" })),
    false
  );
  assert.equal(shouldUseRealAdapter(loadConfig({ ELEVENLABS_API_KEY: "k" })), false);
  assert.equal(shouldUseRealAdapter(loadConfig({})), false);
});

test("ELEVENLABS_FORCE_MOCK overrides fully-configured credentials", () => {
  assert.equal(
    shouldUseRealAdapter(loadConfig({ ...fullEnv, ELEVENLABS_FORCE_MOCK: "1" })),
    false
  );
});

test("missingCredentials names exactly what is unset", () => {
  assert.deepEqual(missingCredentials(loadConfig({})), [
    "ELEVENLABS_API_KEY",
    "ELEVENLABS_AGENT_ID",
    "ELEVENLABS_AGENT_PHONE_NUMBER_ID",
  ]);
  assert.deepEqual(missingCredentials(loadConfig(fullEnv)), []);
});

test("describeConfig never leaks the API key", () => {
  const summary = JSON.stringify(
    describeConfig(loadConfig({ ...fullEnv, ELEVENLABS_API_KEY: "super-secret" }))
  );
  assert.doesNotMatch(summary, /super-secret/);
  assert.match(summary, /"apiKeyConfigured":true/);
});

test("accepts ELEVENLABS_PHONE_NUMBER_ID as an alias", () => {
  const config = loadConfig({ ...fullEnv, ELEVENLABS_AGENT_PHONE_NUMBER_ID: "", ELEVENLABS_PHONE_NUMBER_ID: "p2" });
  assert.equal(config.agentPhoneNumberId, "p2");
  assert.equal(shouldUseRealAdapter(config), true);
});

test("canonical ELEVENLABS_AGENT_PHONE_NUMBER_ID wins over the alias", () => {
  const config = loadConfig({
    ...fullEnv,
    ELEVENLABS_AGENT_PHONE_NUMBER_ID: "canonical",
    ELEVENLABS_PHONE_NUMBER_ID: "alias",
  });
  assert.equal(config.agentPhoneNumberId, "canonical");
});
