import assert from "node:assert/strict";
import test from "node:test";
import {
  applyApiCors,
  handleApiPreflight,
  parseAllowedOrigins,
} from "../src/features/http/cors.ts";

const base44Origin = "https://preview--valiant-sync-orbit-plan.base44.app";
const allowedOrigins = parseAllowedOrigins(
  `${base44Origin}, https://valiant-sync-orbit-plan.base44.app`,
);

test("answers allowed Base44 API preflights with the required headers", () => {
  const response = handleApiPreflight(
    new Request("https://planit.test/api/events", {
      method: "OPTIONS",
      headers: {
        origin: base44Origin,
        "access-control-request-method": "POST",
        "access-control-request-headers":
          "content-type,x-snapplan-guest-id",
      },
    }),
    allowedOrigins,
  );

  assert.equal(response?.status, 204);
  assert.equal(response?.headers.get("access-control-allow-origin"), base44Origin);
  assert.equal(
    response?.headers.get("access-control-allow-methods"),
    "GET, POST, PUT, OPTIONS",
  );
  assert.equal(
    response?.headers.get("access-control-allow-headers"),
    "Content-Type, X-SnapPlan-Guest-Id",
  );
  assert.equal(response?.headers.get("vary"), "Origin");
});

test("adds CORS headers to allowed API responses without changing the body", async () => {
  const request = new Request("https://planit.test/api/events", {
    headers: { origin: base44Origin },
  });
  const response = applyApiCors(
    request,
    Response.json({ ok: true }, { status: 201 }),
    allowedOrigins,
  );

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(response.headers.get("access-control-allow-origin"), base44Origin);
  assert.equal(response.headers.get("vary"), "Origin");
});

test("rejects unapproved preflight origins and never reflects them", () => {
  const origin = "https://attacker.example";
  const response = handleApiPreflight(
    new Request("https://planit.test/api/events", {
      method: "OPTIONS",
      headers: {
        origin,
        "access-control-request-method": "POST",
      },
    }),
    allowedOrigins,
  );

  assert.equal(response?.status, 403);
  assert.equal(response?.headers.get("access-control-allow-origin"), null);
});

test("ignores non-API preflights", () => {
  const response = handleApiPreflight(
    new Request("https://planit.test/", {
      method: "OPTIONS",
      headers: { origin: base44Origin },
    }),
    allowedOrigins,
  );
  assert.equal(response, null);
});
