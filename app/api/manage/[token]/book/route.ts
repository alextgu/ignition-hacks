import { env } from "cloudflare:workers";
import { createD1EventsRepository } from "../../../../../src/features/events/repository";
import { createEventService } from "../../../../../src/features/events/service";
import type { BookingEnv } from "../../../../../src/integrations/elevenlabs/config";
import { createBookHandler } from "./handler";

const handle = createBookHandler(
  createEventService(createD1EventsRepository()),
  {
    getEnv: () => env as BookingEnv,
  },
);

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { token } = await context.params;
  return handle(request, token);
}
