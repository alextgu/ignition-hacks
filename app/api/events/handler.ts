import type { EventRecord } from "../../../src/features/events/contracts";
import { buildEventLinks } from "../../../src/features/events/ids";

type CreateEventService = {
  createEvent(input: unknown): Promise<
    | { ok: true; event: EventRecord }
    | { ok: false; error: string }
  >;
};

export function createEventHandler(service: CreateEventService) {
  return async function handleCreateEvent(request: Request) {
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return Response.json(
        { error: "Send a valid event request." },
        { status: 400 },
      );
    }

    try {
      const result = await service.createEvent(input);
      if (!result.ok) {
        return Response.json({ error: result.error }, { status: 400 });
      }
      const links = buildEventLinks(
        new URL(request.url).origin,
        result.event.publicSlug,
        result.event.managementToken,
      );
      return Response.json(
        { event: result.event, ...links },
        { status: 201 },
      );
    } catch {
      return Response.json(
        { error: "Unable to create the event right now." },
        { status: 500 },
      );
    }
  };
}
