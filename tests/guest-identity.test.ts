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

test("omits Secure only for local development", () => {
  const identity = resolveGuestIdentity(
    new Request("http://localhost:3000/e/demo"),
    () => "local-guest",
  );
  assert.doesNotMatch(identity.setCookie ?? "", /; Secure$/);
});
