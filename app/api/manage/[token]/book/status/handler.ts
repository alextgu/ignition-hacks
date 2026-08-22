import type { EnvLike } from "../../../../../../src/integrations/elevenlabs/config";
import { createBookingAgentAdapter } from "../../../../../../src/integrations/elevenlabs/index";
import type { BookingAgentAdapter } from "../../../../../../src/integrations/elevenlabs/types";

type StatusHandlerOptions = {
  getEnv: () => EnvLike;
  createAdapter?: (env: EnvLike) => BookingAgentAdapter;
};

export function createBookStatusHandler(options: StatusHandlerOptions) {
  return async function handleBookStatus(request: Request) {
    if (request.method !== "GET") {
      return Response.json({ error: "Method not allowed." }, { status: 405 });
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
