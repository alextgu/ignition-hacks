/**
 * Minimal fetch wrapper: adds a timeout (via AbortController) and normalizes
 * every failure mode (network error, timeout, non-2xx, malformed JSON) into
 * a single `HttpCallFailure` shape instead of throwing a grab-bag of error
 * types. Uses only the native `fetch`/`AbortController` — no HTTP client
 * dependency is introduced.
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

export async function fetchJson<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<HttpCallResult<T>> {
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
        message: `World Labs API returned ${response.status}: ${truncate(text, 500)}`,
      };
    }

    if (!text) {
      return { ok: true, status: response.status, data: {} as T };
    }

    try {
      const data = JSON.parse(text) as T;
      return { ok: true, status: response.status, data };
    } catch {
      return {
        ok: false,
        status: response.status,
        reason: "invalid_json",
        message: "World Labs API returned a response that could not be parsed as JSON.",
      };
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        reason: "timeout",
        message: `World Labs API call timed out after ${timeoutMs}ms.`,
      };
    }
    return {
      ok: false,
      reason: "network",
      message: err instanceof Error ? err.message : "Unknown network error calling World Labs API.",
    };
  } finally {
    clearTimeout(timer);
  }
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}
