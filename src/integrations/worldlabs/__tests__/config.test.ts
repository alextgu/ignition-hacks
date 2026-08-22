import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig, shouldUseRealAdapter, describeConfig } from "../config.ts";

test("loadConfig applies sane defaults with no environment set", () => {
  const config = loadConfig({});
  assert.equal(config.apiKey, undefined);
  assert.equal(config.baseUrl, "https://api.worldlabs.ai");
  assert.equal(config.model, "marble-1.1");
  assert.equal(config.timeoutMs, 15_000);
  assert.equal(config.forceMock, false);
});

test("loadConfig reads every variable when present", () => {
  const config = loadConfig({
    WORLDLABS_API_KEY: " secret-key ",
    WORLDLABS_BASE_URL: "https://staging.worldlabs.example",
    WORLDLABS_MODEL: "marble-1.1-plus",
    WORLDLABS_TIMEOUT_MS: "30000",
    WORLDLABS_FORCE_MOCK: "true",
  });
  assert.equal(config.apiKey, "secret-key");
  assert.equal(config.baseUrl, "https://staging.worldlabs.example");
  assert.equal(config.model, "marble-1.1-plus");
  assert.equal(config.timeoutMs, 30_000);
  assert.equal(config.forceMock, true);
});

test("shouldUseRealAdapter requires an API key and respects forceMock", () => {
  assert.equal(shouldUseRealAdapter(loadConfig({})), false);
  assert.equal(
    shouldUseRealAdapter(loadConfig({ WORLDLABS_API_KEY: "k" })),
    true
  );
  assert.equal(
    shouldUseRealAdapter(loadConfig({ WORLDLABS_API_KEY: "k", WORLDLABS_FORCE_MOCK: "1" })),
    false
  );
});

test("describeConfig never leaks the raw API key", () => {
  const summary = JSON.stringify(describeConfig(loadConfig({ WORLDLABS_API_KEY: "super-secret" })));
  assert.doesNotMatch(summary, /super-secret/);
  assert.match(summary, /"apiKeyConfigured":true/);
});

test("accepts WLT_API_KEY and WORLD_LABS_API_KEY as aliases", () => {
  // The team's .env.example uses these names; a mismatch would silently
  // fall through to the mock with real credentials sitting right there.
  assert.equal(loadConfig({ WLT_API_KEY: "k1" }).apiKey, "k1");
  assert.equal(loadConfig({ WORLD_LABS_API_KEY: "k2" }).apiKey, "k2");
  assert.equal(shouldUseRealAdapter(loadConfig({ WLT_API_KEY: "k" })), true);
});

test("canonical WORLDLABS_API_KEY wins over the aliases", () => {
  const config = loadConfig({
    WORLDLABS_API_KEY: "canonical",
    WLT_API_KEY: "alias",
    WORLD_LABS_API_KEY: "alias2",
  });
  assert.equal(config.apiKey, "canonical");
});
