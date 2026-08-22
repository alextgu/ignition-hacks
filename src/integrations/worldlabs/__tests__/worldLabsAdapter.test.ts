import test from "node:test";
import assert from "node:assert/strict";
import { RealWorldLabsAdapter } from "../worldLabsAdapter.ts";
import type { WorldLabsConfig } from "../config.ts";
import type { WorldSeed } from "../types.ts";

const seed: WorldSeed = {
  description: "a cozy birthday dinner",
  eventType: "birthday dinner",
  mood: "cozy",
  location: "Toronto",
  timeCharacter: "golden hour",
  groupSize: 6,
  priceCharacter: "mid-range",
};

const config: WorldLabsConfig = {
  apiKey: "test-key",
  baseUrl: "https://api.worldlabs.test",
  model: "marble-1.1",
  timeoutMs: 5_000,
  forceMock: false,
};

/** Installs a fake `global.fetch` for the duration of one test and restores it after. */
function withMockFetch<T>(
  handler: (url: string, init: RequestInit) => Promise<Response> | Response,
  run: () => Promise<T>
): Promise<T> {
  const original = globalThis.fetch;
  // @ts-expect-error -- test double, signature intentionally narrowed
  globalThis.fetch = async (url: string, init: RequestInit) => handler(url, init);
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("generateWorld sends the mapped prompt and World Labs auth header", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;

  await withMockFetch(
    async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return jsonResponse({ operation_id: "op_123", done: false });
    },
    async () => {
      const adapter = new RealWorldLabsAdapter(config);
      const result = await adapter.generateWorld(seed);
      assert.equal(result.status, "pending");
      assert.equal(result.externalId, "op_123");
    }
  );

  assert.equal(capturedUrl, "https://api.worldlabs.test/marble/v1/worlds:generate");
  assert.equal((capturedInit?.headers as Record<string, string>)["WLT-Api-Key"], "test-key");
  const body = JSON.parse(capturedInit?.body as string);
  assert.equal(body.model, "marble-1.1");
  assert.equal(body.world_prompt.type, "text");
  assert.match(body.world_prompt.text_prompt, /Toronto/);
});

test("generateWorld maps a synchronously-completed operation to status ready", async () => {
  await withMockFetch(
    async () =>
      jsonResponse({
        operation_id: "op_done",
        done: true,
        response: {
          world_id: "w_1",
          world_marble_url: "https://marble.worldlabs.ai/world/w_1",
          assets: { thumbnail_url: "https://cdn.worldlabs.ai/thumb/w_1.jpg" },
        },
      }),
    async () => {
      const adapter = new RealWorldLabsAdapter(config);
      const result = await adapter.generateWorld(seed);
      assert.deepEqual(result, {
        status: "ready",
        externalId: "op_done",
        embedUrl: "https://marble.worldlabs.ai/world/w_1",
        previewImageUrl: "https://cdn.worldlabs.ai/thumb/w_1.jpg",
      });
    }
  );
});

test("generateWorld falls back to constructing the viewer URL from world_id", async () => {
  await withMockFetch(
    async () =>
      jsonResponse({
        operation_id: "op_done2",
        done: true,
        response: { world_id: "w_2", assets: {} },
      }),
    async () => {
      const adapter = new RealWorldLabsAdapter(config);
      const result = await adapter.generateWorld(seed);
      assert.equal(result.embedUrl, "https://marble.worldlabs.ai/world/w_2");
    }
  );
});

test("getWorldStatus reports pending while an operation is in flight", async () => {
  await withMockFetch(
    async (url) => {
      assert.equal(url, "https://api.worldlabs.test/marble/v1/operations/op_123");
      return jsonResponse({ operation_id: "op_123", done: false, metadata: { progress: 0.4 } });
    },
    async () => {
      const adapter = new RealWorldLabsAdapter(config);
      const result = await adapter.getWorldStatus("op_123");
      assert.equal(result.status, "pending");
    }
  );
});

test("getWorldStatus maps an operation-level error to status failed", async () => {
  await withMockFetch(
    async () =>
      jsonResponse({
        operation_id: "op_err",
        done: true,
        error: { code: "GENERATION_FAILED", message: "prompt violated content policy" },
      }),
    async () => {
      const adapter = new RealWorldLabsAdapter(config);
      const result = await adapter.getWorldStatus("op_err");
      assert.equal(result.status, "failed");
      assert.match(result.error!, /content policy/);
    }
  );
});

test("a non-2xx HTTP response is converted to a controlled failed result, not a throw", async () => {
  await withMockFetch(
    async () => jsonResponse({ message: "invalid api key" }, 401),
    async () => {
      const adapter = new RealWorldLabsAdapter(config);
      const result = await adapter.generateWorld(seed);
      assert.equal(result.status, "failed");
      assert.match(result.error!, /401/);
    }
  );
});

test("a network/timeout failure is converted to a controlled failed result, not a throw", async () => {
  const original = globalThis.fetch;
  // @ts-expect-error -- test double
  globalThis.fetch = async () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  };
  try {
    const adapter = new RealWorldLabsAdapter(config);
    const result = await adapter.generateWorld(seed);
    assert.equal(result.status, "failed");
    assert.match(result.error!, /timed out/i);
  } finally {
    globalThis.fetch = original;
  }
});

test("generateWorld fails cleanly without calling fetch when no API key is configured", async () => {
  let fetchCalled = false;
  await withMockFetch(
    async () => {
      fetchCalled = true;
      return jsonResponse({});
    },
    async () => {
      const adapter = new RealWorldLabsAdapter({ ...config, apiKey: undefined });
      const result = await adapter.generateWorld(seed);
      assert.equal(result.status, "failed");
      assert.match(result.error!, /WORLDLABS_API_KEY/);
    }
  );
  assert.equal(fetchCalled, false);
});
