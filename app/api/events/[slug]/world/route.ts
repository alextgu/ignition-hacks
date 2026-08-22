import { env } from "cloudflare:workers";
import { createD1EventsRepository } from "../../../../../src/features/events/repository";
import { createWorldService } from "../../../../../src/features/world/service";
import { createWorldLabsAdapter } from "../../../../../src/integrations/worldlabs";
import { loadConfig, shouldUseRealAdapter, type EnvLike } from "../../../../../src/integrations/worldlabs/config";
import { createWorldStateHandler } from "./handler";

const handle = createWorldStateHandler(
  createWorldService({
    repository: createD1EventsRepository(),
    // Built per call from the Worker env, matching the booking route: the
    // Cloudflare binding is what carries WLT_API_KEY in production, and it
    // is not readable at module-import time.
    adapter: () => createWorldLabsAdapter(env as unknown as EnvLike),
    isLive: () => shouldUseRealAdapter(loadConfig(env as unknown as EnvLike)),
  }),
);

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  return handle(request, slug);
}
