const cookieName = "snapplan_guest_id";
const guestIdPattern = /^[a-zA-Z0-9_-]{8,128}$/;

function readGuestHeader(request: Request) {
  const value = request.headers.get("x-snapplan-guest-id");
  return value && guestIdPattern.test(value) ? value : null;
}

function readCookie(header: string | null) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name !== cookieName) continue;
    const value = valueParts.join("=");
    if (guestIdPattern.test(value)) return value;
  }
  return null;
}

function defaultGuestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function resolveGuestIdentity(
  request: Request,
  createId: () => string = defaultGuestId,
) {
  const headerGuestId = readGuestHeader(request);
  if (headerGuestId) return { guestId: headerGuestId, setCookie: null };

  const existing = readCookie(request.headers.get("cookie"));
  if (existing) return { guestId: existing, setCookie: null };

  const guestId = createId();
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return {
    guestId,
    setCookie:
      `${cookieName}=${guestId}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`,
  };
}
