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

// ---------------------------------------------------------------------------
// Generation modes: text -> venue photo -> guest photos, escalating fidelity.
// ---------------------------------------------------------------------------

test("with no photos the request is a plain text prompt", async () => {
  await withMockFetch(
    async (_url, init) => {
      const wp = JSON.parse(init.body as string).world_prompt;
      assert.equal(wp.type, "text");
      assert.match(wp.text_prompt, /Toronto/);
      return jsonResponse({ operation_id: "op_t", done: false });
    },
    async () => {
      const adapter = new RealWorldLabsAdapter(config);
      assert.equal((await adapter.generateWorld(seed)).status, "pending");
    }
  );
});

test("a venue photo switches the request to image mode and keeps the text steer", async () => {
  await withMockFetch(
    async (_url, init) => {
      const wp = JSON.parse(init.body as string).world_prompt;
      assert.equal(wp.type, "image");
      assert.deepEqual(wp.image_prompt, {
        source: "uri",
        uri: "https://example.test/venue.jpg",
      });
      assert.match(wp.text_prompt, /Toronto/);
      assert.equal(wp.is_pano, "auto");
      return jsonResponse({ operation_id: "op_i", done: false });
    },
    async () => {
      const adapter = new RealWorldLabsAdapter(config);
      await adapter.generateWorld({
        ...seed,
        venuePhoto: { source: "uri", uri: "https://example.test/venue.jpg" },
      });
    }
  );
});

test("a media asset id is sent as media_asset, not a uri", async () => {
  await withMockFetch(
    async (_url, init) => {
      const wp = JSON.parse(init.body as string).world_prompt;
      assert.deepEqual(wp.image_prompt, {
        source: "media_asset",
        media_asset_id: "asset_123",
      });
      return jsonResponse({ operation_id: "op_m", done: false });
    },
    async () => {
      const adapter = new RealWorldLabsAdapter(config);
      await adapter.generateWorld({
        ...seed,
        venuePhoto: { source: "mediaAsset", mediaAssetId: "asset_123" },
      });
    }
  );
});

test("guest photos build a multi-image request with directional azimuths", async () => {
  await withMockFetch(
    async (_url, init) => {
      const wp = JSON.parse(init.body as string).world_prompt;
      assert.equal(wp.type, "multi-image");
      assert.deepEqual(
        wp.multi_image_prompt.map((p: { azimuth: number }) => p.azimuth),
        [0, 90, 180]
      );
      assert.equal(wp.multi_image_prompt[0].content.uri, "https://x.test/1.jpg");
      return jsonResponse({ operation_id: "op_mi", done: false });
    },
    async () => {
      const adapter = new RealWorldLabsAdapter(config);
      await adapter.generateWorld({
        ...seed,
        guestPhotos: [
          { source: "uri", uri: "https://x.test/1.jpg", direction: "front" },
          { source: "uri", uri: "https://x.test/2.jpg", direction: "right" },
          { source: "uri", uri: "https://x.test/3.jpg", direction: "back" },
        ],
      });
    }
  );
});

test("unlabelled guest photos are spread evenly around the room", async () => {
  await withMockFetch(
    async (_url, init) => {
      const wp = JSON.parse(init.body as string).world_prompt;
      assert.deepEqual(
        wp.multi_image_prompt.map((p: { azimuth: number }) => p.azimuth),
        [0, 90, 180, 270]
      );
      return jsonResponse({ operation_id: "op_sp", done: false });
    },
    async () => {
      const adapter = new RealWorldLabsAdapter(config);
      await adapter.generateWorld({
        ...seed,
        guestPhotos: Array.from({ length: 4 }, (_, i) => ({
          source: "uri" as const,
          uri: `https://x.test/${i}.jpg`,
        })),
      });
    }
  );
});

test("guest photos are capped at World Labs' limit of 8", async () => {
  await withMockFetch(
    async (_url, init) => {
      const wp = JSON.parse(init.body as string).world_prompt;
      assert.equal(wp.multi_image_prompt.length, 8);
      return jsonResponse({ operation_id: "op_cap", done: false });
    },
    async () => {
      const adapter = new RealWorldLabsAdapter(config);
      await adapter.generateWorld({
        ...seed,
        guestPhotos: Array.from({ length: 14 }, (_, i) => ({
          source: "uri" as const,
          uri: `https://x.test/${i}.jpg`,
        })),
      });
    }
  );
});

test("guest photos win over a venue photo", async () => {
  await withMockFetch(
    async (_url, init) => {
      assert.equal(JSON.parse(init.body as string).world_prompt.type, "multi-image");
      return jsonResponse({ operation_id: "op_w", done: false });
    },
    async () => {
      const adapter = new RealWorldLabsAdapter(config);
      await adapter.generateWorld({
        ...seed,
        venuePhoto: { source: "uri", uri: "https://x.test/venue.jpg" },
        guestPhotos: [
          { source: "uri", uri: "https://x.test/a.jpg" },
          { source: "uri", uri: "https://x.test/b.jpg" },
        ],
      });
    }
  );
});

test("a single guest photo falls back to image mode, not multi-image", async () => {
  await withMockFetch(
    async (_url, init) => {
      const wp = JSON.parse(init.body as string).world_prompt;
      assert.equal(wp.type, "image");
      assert.equal(wp.image_prompt.uri, "https://x.test/only.jpg");
      return jsonResponse({ operation_id: "op_one", done: false });
    },
    async () => {
      const adapter = new RealWorldLabsAdapter(config);
      await adapter.generateWorld({
        ...seed,
        guestPhotos: [{ source: "uri", uri: "https://x.test/only.jpg" }],
      });
    }
  );
});

test("expansive seeds select the larger model", async () => {
  await withMockFetch(
    async (_url, init) => {
      assert.equal(JSON.parse(init.body as string).model, "marble-1.1-plus");
      return jsonResponse({ operation_id: "op_p", done: false });
    },
    async () => {
      const adapter = new RealWorldLabsAdapter(config);
      await adapter.generateWorld({ ...seed, expansive: true });
    }
  );
});

// ---------------------------------------------------------------------------
// Render assets: what our own SparkJS viewer needs.
// ---------------------------------------------------------------------------

test("a ready world exposes splats, collider, pano, scale and ground plane", async () => {
  await withMockFetch(
    async () =>
      jsonResponse({
        operation_id: "op_a",
        done: true,
        response: {
          world_id: "w_9",
          world_marble_url: "https://marble.worldlabs.ai/world/w_9",
          assets: {
            thumbnail_url: "https://cdn.test/t.jpg",
            caption: "A warm dining room",
            imagery: { pano_url: "https://cdn.test/pano.jpg" },
            mesh: { collider_mesh_url: "https://cdn.test/collider.glb" },
            splats: {
              spz_urls: {
                "100k": "https://cdn.test/a.spz",
                "500k": "https://cdn.test/b.spz",
                full_res: "https://cdn.test/c.spz",
              },
              semantics_metadata: { scale: 1.8, ground_plane_offset: -0.42 },
            },
          },
        },
      }),
    async () => {
      const adapter = new RealWorldLabsAdapter(config);
      const result = await adapter.generateWorld(seed);
      assert.equal(result.status, "ready");
      assert.deepEqual(result.assets?.splatUrls, {
        low: "https://cdn.test/a.spz",
        medium: "https://cdn.test/b.spz",
        full: "https://cdn.test/c.spz",
      });
      assert.equal(result.assets?.colliderMeshUrl, "https://cdn.test/collider.glb");
      assert.equal(result.assets?.panoUrl, "https://cdn.test/pano.jpg");
      assert.equal(result.assets?.scale, 1.8);
      assert.equal(result.assets?.groundPlaneOffset, -0.42);
      assert.equal(result.assets?.caption, "A warm dining room");
    }
  );
});

test("a world with no splats still succeeds, just without render assets", async () => {
  await withMockFetch(
    async () =>
      jsonResponse({
        operation_id: "op_b",
        done: true,
        response: { world_id: "w_10", assets: { thumbnail_url: "https://cdn.test/t.jpg" } },
      }),
    async () => {
      const adapter = new RealWorldLabsAdapter(config);
      const result = await adapter.generateWorld(seed);
      assert.equal(result.status, "ready");
      assert.equal(result.assets, undefined);
      assert.equal(result.previewImageUrl, "https://cdn.test/t.jpg");
    }
  );
});
