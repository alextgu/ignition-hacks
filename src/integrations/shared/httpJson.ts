/**
 * Shared JSON-over-HTTP helper used by every external integration in this
 * repository (World Labs, ElevenLabs).
 *
 * Purpose: give every adapter ONE way to make a network call that
 *   (a) always has a timeout, and
 *   (b) never throws — every failure mode (network error, timeout, non-2xx,
 *       malformed JSON) is normalized into a single `HttpCallFailure` shape.
 *
 * That second property is what lets the adapters guarantee "external service
 * problems become a controlled failed result, not an exception" without each
 * one re-implementing try/catch plumbing.
 *
 * Uses only native `fetch` / `AbortController` — no HTTP client dependency.
 */

export type HttpCallSuccess<T> = {
  ok: true;
  status: number;
  data: T;
};

export type HttpCallFailure = {
  ok: false;
  status?: number;
  reason: "timeout" | "network" | "http_error" | "invalid_json";
  message: string;
};

export type HttpCallResult<T> = HttpCallSuccess<T> | HttpCallFailure;

export type FetchJsonOptions = {
  /** Prefix used in error messages, e.g. "World Labs" or "ElevenLabs". */
  serviceLabel: string;
  timeoutMs: number;
};

export async function fetchJson<T>(
  url: string,
  init: RequestInit,
  options: FetchJsonOptions
): Promise<HttpCallResult<T>> {
  const { serviceLabel, timeoutMs } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        reason: "http_error",
        message: `${serviceLabel} API returned ${response.status}: ${truncate(text, 500)}`,
      };
    }

    if (!text) {
      return { ok: true, status: response.status, data: {} as T };
    }

    try {
      return { ok: true, status: response.status, data: JSON.parse(text) as T };
    } catch {
      return {
        ok: false,
        status: response.status,
        reason: "invalid_json",
        message: `${serviceLabel} API returned a response that could not be parsed as JSON.`,
      };
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        reason: "timeout",
        message: `${serviceLabel} API call timed out after ${timeoutMs}ms.`,
      };
    }
    return {
      ok: false,
      reason: "network",
      message:
        err instanceof Error
          ? err.message
          : `Unknown network error calling the ${serviceLabel} API.`,
    };
  } finally {
    clearTimeout(timer);
  }
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}
