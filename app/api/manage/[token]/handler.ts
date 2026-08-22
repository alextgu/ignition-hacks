import type {
  AttendeeRecord,
  EventRecord,
  InvitationRecord,
} from "../../../../src/features/events/contracts";
import { summarizeResponses } from "../../../../src/features/events/summary";

type ManageService = {
  getManagedEvent(
    token: string,
  ): Promise<{
    event: EventRecord;
    attendees: AttendeeRecord[];
    invitations?: InvitationRecord[];
  } | null>;
};

type InvitationService = {
  createInvitations(
    token: string,
    input: unknown,
  ): Promise<
    | {
        ok: true;
        event: EventRecord;
        invitations: InvitationRecord[];
      }
    | { ok: false; error: string }
  >;
};

function invitationLinks(
  origin: string,
  publicSlug: string,
  invitations: InvitationRecord[],
) {
  return invitations.map((invitation) => ({
    suggestedName: invitation.suggestedName,
    guestUrl:
      `${origin}/e/${publicSlug}?invite=${encodeURIComponent(invitation.token)}`,
  }));
}

export function createManageHandler(service: ManageService) {
  return async function handleManage(request: Request, token: string) {
    const managed = await service.getManagedEvent(token);
    if (!managed) {
      return Response.json({ error: "Event not found." }, { status: 404 });
    }
    const { managementToken: _managementToken, ...event } = managed.event;
    void _managementToken;
    const origin = new URL(request.url).origin;
    return Response.json({
      event,
      attendees: managed.attendees,
      summary: summarizeResponses(managed.event, managed.attendees),
      guestUrl: `${origin}/e/${managed.event.publicSlug}`,
      invitations: invitationLinks(
        origin,
        managed.event.publicSlug,
        managed.invitations ?? [],
      ),
    });
  };
}

export function createInvitationsHandler(service: InvitationService) {
  return async function handleCreateInvitations(request: Request, token: string) {
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return Response.json(
        { error: "Send a valid invitation request." },
        { status: 400 },
      );
    }

    try {
      const result = await service.createInvitations(token, input);
      if (!result.ok) {
        const status = result.error === "Event not found." ? 404 : 400;
        return Response.json({ error: result.error }, { status });
      }
      const origin = new URL(request.url).origin;
      return Response.json(
        {
          invitations: invitationLinks(
            origin,
            result.event.publicSlug,
            result.invitations,
          ),
        },
        { status: 201 },
      );
    } catch {
      return Response.json(
        { error: "Unable to create invitation links right now." },
        { status: 500 },
      );
    }
  };
}
