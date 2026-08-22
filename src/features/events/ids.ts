function randomToken(byteLength: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42) || "plan";
}

export function createPublicSlug(
  title: string,
  suffix = randomToken(4),
) {
  return `${slugify(title)}-${suffix}`;
}

export function createManagementToken(token = randomToken(24)) {
  return token;
}

export function createInvitationToken(token = randomToken(24)) {
  return token;
}

export function buildEventLinks(
  origin: string,
  publicSlug: string,
  managementToken: string,
) {
  const base = origin.replace(/\/$/, "");
  return {
    guestUrl: `${base}/e/${publicSlug}`,
    manageUrl: `${base}/manage/${managementToken}`,
  };
}
