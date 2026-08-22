import type {
  AttendeeRecord,
  EventRecord,
  InvitationRecord,
} from "../../../../../src/features/events/contracts";
import { resolveGuestIdentity } from "../../../../../src/features/guests/identity";

type GuestResponseService = {
  resolveInvitation(
    slug: string,
    token: string,
  ): Promise<InvitationRecord | null>;
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

const invitationTokenPattern = /^[a-zA-Z0-9_-]{16,128}$/;

async function resolveRequestIdentity(
  request: Request,
  slug: string,
  service: GuestResponseService,
  createGuestId?: () => string,
) {
  const url = new URL(request.url);
  if (url.searchParams.has("invite")) {
    const token = url.searchParams.get("invite") ?? "";
    if (!invitationTokenPattern.test(token)) return null;
    const invitation = await service.resolveInvitation(slug, token);
    if (!invitation) return null;
    return {
      guestId: `invite_${invitation.id}`,
      setCookie: null,
      suggestedName: invitation.suggestedName,
    };
  }
  return {
    ...resolveGuestIdentity(request, createGuestId),
    suggestedName: null,
  };
}

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
      const identity = await resolveRequestIdentity(
        request,
        slug,
        service,
        createGuestId,
      );
      if (!identity) {
        return Response.json(
          { error: "Invitation not found." },
          { status: 404 },
        );
      }
      const result = await service.getGuestResponse(slug, identity.guestId);
      if (!result) {
        return jsonWithIdentity(
          { error: "Event not found." },
          404,
          identity.setCookie,
        );
      }
      const { managementToken, ...publicEvent } = result.event;
      void managementToken;
      return jsonWithIdentity(
        {
          event: publicEvent,
          attendee: result.attendee,
          suggestedName: identity.suggestedName,
        },
        200,
        identity.setCookie,
      );
    },

    async put(request: Request, slug: string) {
      const identity = await resolveRequestIdentity(
        request,
        slug,
        service,
        createGuestId,
      );
      if (!identity) {
        return Response.json(
          { error: "Invitation not found." },
          { status: 404 },
        );
      }
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
