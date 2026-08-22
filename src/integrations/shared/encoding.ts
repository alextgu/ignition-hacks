/**
 * Runtime-agnostic encoding and hashing helpers.
 *
 * These exist so the integration modules can run unchanged on Node, on Deno
 * (Base44 backend functions), and in a browser. Everything here uses only
 * web-standard globals — `TextEncoder`, `TextDecoder`, `btoa`, `atob` — so
 * there is no dependency on `Buffer` or `node:crypto`.
 *
 * That portability is the whole point: the same adapter source can be pasted
 * into a Base44 backend function without a rewrite.
 */

/** Encodes a UTF-8 string as base64url (no padding). */
export function toBase64Url(value: string): string {
  return toBase64(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decodes a base64url string back to UTF-8. Throws on malformed input. */
export function fromBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return fromBase64(padded);
}

/** Encodes a UTF-8 string as standard base64 (with padding). */
export function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  // Chunked to avoid blowing the argument limit on large payloads (SVG/HTML).
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Decodes standard base64 to a UTF-8 string. */
export function fromBase64(value: string): string {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Deterministic 32-bit FNV-1a hash, returned as 8 lowercase hex characters.
 *
 * Used only to derive stable visual values (a hue, a palette index) from a
 * seed. It is NOT a cryptographic hash and must never be used for anything
 * security-relevant — but unlike `node:crypto` it runs identically in every
 * JavaScript runtime, which is what this needs.
 */
export function stableHash(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i];
    // FNV prime 16777619, kept in 32-bit unsigned range via Math.imul.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Reads environment variables in whatever runtime we're in, without assuming
 * `process` exists. Returns an empty object where there is no environment to
 * read (Deno without permissions, a browser). Base44 backend functions should
 * bypass this entirely and build the config from `secrets.get()`.
 */
export function readEnv(): Record<string, string | undefined> {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  if (proc?.env) return proc.env;

  const deno = (globalThis as { Deno?: { env?: { toObject(): Record<string, string> } } }).Deno;
  if (deno?.env) {
    try {
      return deno.env.toObject();
    } catch {
      return {};
    }
  }

  return {};
}
