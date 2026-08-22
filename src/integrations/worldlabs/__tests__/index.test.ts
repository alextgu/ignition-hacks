import test from "node:test";
import assert from "node:assert/strict";
import { createWorldLabsAdapter, describeWorldLabsConfig, getWorldLabsAdapter, resetWorldLabsAdapterForTests } from "../index.ts";
import { MockWorldLabsAdapter } from "../mockAdapter.ts";
import { RealWorldLabsAdapter } from "../worldLabsAdapter.ts";

test("createWorldLabsAdapter returns the mock adapter with no API key configured", () => {
  const adapter = createWorldLabsAdapter({});
  assert.ok(adapter instanceof MockWorldLabsAdapter);
});

test("createWorldLabsAdapter returns the real adapter once an API key is present", () => {
  const adapter = createWorldLabsAdapter({ WORLDLABS_API_KEY: "k" });
  assert.ok(adapter instanceof RealWorldLabsAdapter);
});

test("WORLDLABS_FORCE_MOCK overrides a configured API key", () => {
  const adapter = createWorldLabsAdapter({ WORLDLABS_API_KEY: "k", WORLDLABS_FORCE_MOCK: "true" });
  assert.ok(adapter instanceof MockWorldLabsAdapter);
});

test("getWorldLabsAdapter memoizes a single instance per process", () => {
  resetWorldLabsAdapterForTests();
  const first = getWorldLabsAdapter();
  const second = getWorldLabsAdapter();
  assert.equal(first, second);
  resetWorldLabsAdapterForTests();
});

test("describeWorldLabsConfig never leaks the raw API key", () => {
  const summary = JSON.stringify(describeWorldLabsConfig({ WORLDLABS_API_KEY: "super-secret" }));
  assert.doesNotMatch(summary, /super-secret/);
});
