import type {
  AttendeeRecord,
  EventRecord,
} from "../../../../src/features/events/contracts";
import { summarizeResponses } from "../../../../src/features/events/summary";

type ManageService = {
  getManagedEvent(
    token: string,
  ): Promise<{ event: EventRecord; attendees: AttendeeRecord[] } | null>;
};

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
    });
  };
}
