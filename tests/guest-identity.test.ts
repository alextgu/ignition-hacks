import assert from "node:assert/strict";
import test from "node:test";
import { resolveGuestIdentity } from "../src/features/guests/identity.ts";

test("creates a persistent secure guest identity", () => {
  const identity = resolveGuestIdentity(
    new Request("https://snapplan.test/e/demo"),
    () => "guest-secret",
  );
  assert.equal(identity.guestId, "guest-secret");
  assert.equal(
    identity.setCookie,
    "snapplan_guest_id=guest-secret; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax; Secure",
  );
});

test("restores the same guest identity from its cookie", () => {
  const identity = resolveGuestIdentity(
    new Request("https://snapplan.test/e/demo", {
      headers: { cookie: "theme=light; snapplan_guest_id=guest-secret" },
    }),
    () => "different",
  );
  assert.deepEqual(identity, { guestId: "guest-secret", setCookie: null });
});

test("uses a valid Base44 guest header instead of cross-site cookies", () => {
  const identity = resolveGuestIdentity(
    new Request("https://snapplan.test/e/demo", {
      headers: {
        cookie: "snapplan_guest_id=cookie-guest",
        "x-snapplan-guest-id": "base44-browser-guest",
      },
    }),
    () => "different",
  );
  assert.deepEqual(identity, {
    guestId: "base44-browser-guest",
    setCookie: null,
  });
});

test("ignores malformed Base44 guest headers", () => {
  const identity = resolveGuestIdentity(
    new Request("https://snapplan.test/e/demo", {
      headers: { "x-snapplan-guest-id": "bad id!" },
    }),
    () => "generated-guest",
  );
  assert.equal(identity.guestId, "generated-guest");
  assert.match(identity.setCookie ?? "", /^snapplan_guest_id=generated-guest;/);
});

test("omits Secure only for local development", () => {
  const identity = resolveGuestIdentity(
    new Request("http://localhost:3000/e/demo"),
    () => "local-guest",
  );
  assert.doesNotMatch(identity.setCookie ?? "", /; Secure$/);
});
