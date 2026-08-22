const allowedMethods = "GET, POST, PUT, OPTIONS";
const allowedHeaders = "Content-Type, X-SnapPlan-Guest-Id";

function isApiRequest(request: Request) {
  return new URL(request.url).pathname.startsWith("/api/");
}

function allowedOrigin(request: Request, allowedOrigins: ReadonlySet<string>) {
  const origin = request.headers.get("origin");
  return origin && allowedOrigins.has(origin) ? origin : null;
}

function addVaryOrigin(headers: Headers) {
  const vary = headers.get("vary");
  if (!vary) {
    headers.set("vary", "Origin");
    return;
  }
  if (!vary.split(",").some((value) => value.trim() === "Origin")) {
    headers.set("vary", `${vary}, Origin`);
  }
}

export function parseAllowedOrigins(value: string | undefined) {
  const origins = new Set<string>();
  for (const candidate of value?.split(",") ?? []) {
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    try {
      origins.add(new URL(trimmed).origin);
    } catch {
      // Ignore malformed deployment configuration instead of reflecting it.
    }
  }
  return origins;
}

export function handleApiPreflight(
  request: Request,
  allowedOrigins: ReadonlySet<string>,
) {
  if (request.method !== "OPTIONS" || !isApiRequest(request)) return null;

  const origin = allowedOrigin(request, allowedOrigins);
  if (!origin) return new Response(null, { status: 403 });

  const headers = new Headers({
    "access-control-allow-origin": origin,
    "access-control-allow-methods": allowedMethods,
    "access-control-allow-headers": allowedHeaders,
    "access-control-max-age": "600",
  });
  addVaryOrigin(headers);
  return new Response(null, { status: 204, headers });
}

export function applyApiCors(
  request: Request,
  response: Response,
  allowedOrigins: ReadonlySet<string>,
) {
  if (!isApiRequest(request)) return response;
  const origin = allowedOrigin(request, allowedOrigins);
  if (!origin) return response;

  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  addVaryOrigin(headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
