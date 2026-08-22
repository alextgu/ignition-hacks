const SIGNATURE_TOLERANCE_MS = 30 * 60 * 1000;

export type WebhookVerifyResult =
  | { ok: true; event: unknown }
  | { ok: false; error: string };

function parseSignatureHeader(header: string | null) {
  if (!header) return null;
  const parts = Object.fromEntries(
    header
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) return ["", ""];
        return [part.slice(0, index), part.slice(index + 1)];
      }),
  );
  const timestamp = parts.t;
  const signatures = header
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v0="))
    .map((part) => part.slice(3));
  if (!timestamp || signatures.length === 0) return null;
  return { timestamp, signatures };
}

async function hmacSha256Hex(secret: string, message: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function verifyElevenLabsWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | null,
): Promise<WebhookVerifyResult> {
  if (!secret) {
    return { ok: false, error: "ELEVENLABS_WEBHOOK_SECRET is not configured." };
  }

  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) {
    return { ok: false, error: "Missing or malformed ElevenLabs-Signature." };
  }

  const timestampMs = Number(parsed.timestamp) * 1000;
  if (!Number.isFinite(timestampMs)) {
    return { ok: false, error: "Invalid webhook timestamp." };
  }
  if (Math.abs(Date.now() - timestampMs) > SIGNATURE_TOLERANCE_MS) {
    return { ok: false, error: "Webhook timestamp is outside the tolerance window." };
  }

  const expected = `v0=${await hmacSha256Hex(secret, `${parsed.timestamp}.${rawBody}`)}`;
  const matched = parsed.signatures.some((signature) =>
    timingSafeEqual(`v0=${signature}`, expected),
  );
  if (!matched) {
    return { ok: false, error: "Webhook signature verification failed." };
  }

  try {
    return { ok: true, event: JSON.parse(rawBody) as unknown };
  } catch {
    return { ok: false, error: "Webhook body must be valid JSON." };
  }
}
