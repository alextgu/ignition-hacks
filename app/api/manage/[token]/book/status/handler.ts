import type { EnvLike } from "../../../../../../src/integrations/elevenlabs/config";
import { createBookingAgentAdapter } from "../../../../../../src/integrations/elevenlabs/index";
import type { BookingAgentAdapter } from "../../../../../../src/integrations/elevenlabs/types";

type StatusHandlerOptions = {
  getEnv: () => EnvLike;
  createAdapter?: (env: EnvLike) => BookingAgentAdapter;
};

type StatusService = {
  getManagedEvent(token: string): Promise<unknown | null>;
};

export function createBookStatusHandler(
  service: StatusService,
  options: StatusHandlerOptions,
) {
  return async function handleBookStatus(request: Request, token: string) {
    if (request.method !== "GET") {
      return Response.json({ error: "Method not allowed." }, { status: 405 });
    }

    const managed = await service.getManagedEvent(token);
    if (!managed) {
      return Response.json({ error: "Event not found." }, { status: 404 });
    }

    const callId = new URL(request.url).searchParams.get("callId")?.trim();
    if (!callId) {
      return Response.json(
        { error: "Provide callId as a query parameter." },
        { status: 400 },
      );
    }

    const adapter = (options.createAdapter ?? createBookingAgentAdapter)(
      options.getEnv(),
    );
    const call = await adapter.getBookingCallStatus(callId);
    return Response.json({ call });
  };
}
