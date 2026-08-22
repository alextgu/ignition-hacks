import type {
  AttendeeRecord,
  EventRecord,
} from "../../../../../src/features/events/contracts";
import { resolveGuestIdentity } from "../../../../../src/features/guests/identity";

type GuestResponseService = {
  getGuestResponse(
    slug: string,
    guestId: string,
  ): Promise<{ event: EventRecord; attendee: AttendeeRecord | null } | null>;
  upsertGuestResponse(
    slug: string,
    guestId: string,
    input: unknown,
  ): Promise<
    | { ok: true; attendee: AttendeeRecord }
    | { ok: false; error: string }
  >;
};

function jsonWithIdentity(
  value: unknown,
  status: number,
  setCookie: string | null,
) {
  const headers = new Headers();
  if (setCookie) headers.set("set-cookie", setCookie);
  return Response.json(value, { status, headers });
}

export function createRsvpHandlers(
  service: GuestResponseService,
  createGuestId?: () => string,
) {
  return {
    async get(request: Request, slug: string) {
      const identity = resolveGuestIdentity(request, createGuestId);
      const result = await service.getGuestResponse(slug, identity.guestId);
      if (!result) {
        return jsonWithIdentity(
          { error: "Event not found." },
          404,
          identity.setCookie,
        );
      }
      return jsonWithIdentity(
        { attendee: result.attendee },
        200,
        identity.setCookie,
      );
    },

    async put(request: Request, slug: string) {
      const identity = resolveGuestIdentity(request, createGuestId);
      let input: unknown;
      try {
        input = await request.json();
      } catch {
        return jsonWithIdentity(
          { error: "Send a valid response." },
          400,
          identity.setCookie,
        );
      }
      const result = await service.upsertGuestResponse(
        slug,
        identity.guestId,
        input,
      );
      if (!result.ok) {
        const status = result.error === "Event not found." ? 404 : 400;
        return jsonWithIdentity(
          { error: result.error },
          status,
          identity.setCookie,
        );
      }
      return jsonWithIdentity(
        { attendee: result.attendee },
        200,
        identity.setCookie,
      );
    },
  };
}
