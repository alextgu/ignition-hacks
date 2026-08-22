import { env } from "cloudflare:workers";
import { createD1EventsRepository } from "../../../../../../src/features/events/repository";
import { createEventService } from "../../../../../../src/features/events/service";
import type { EnvLike } from "../../../../../../src/integrations/elevenlabs/config";
import { createBookStatusHandler } from "./handler";

const handle = createBookStatusHandler(
  createEventService(createD1EventsRepository()),
  {
    getEnv: () => env as unknown as EnvLike,
  },
);

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { token } = await context.params;
  return handle(request, token);
}
