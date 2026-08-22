import { env } from "cloudflare:workers";
import { createD1EventsRepository } from "../../../src/features/events/repository";
import { createEventService } from "../../../src/features/events/service";
import { createWorldService } from "../../../src/features/world/service";
import { createWorldLabsAdapter } from "../../../src/integrations/worldlabs";
import { loadConfig, shouldUseRealAdapter, type EnvLike } from "../../../src/integrations/worldlabs/config";
import { createEventHandler } from "./handler";

const repository = createD1EventsRepository();

const worldService = createWorldService({
  repository,
  adapter: () => createWorldLabsAdapter(env as unknown as EnvLike),
  isLive: () => shouldUseRealAdapter(loadConfig(env as unknown as EnvLike)),
});

export const POST = createEventHandler(createEventService(repository), {
  // Exactly one Marble generation per event, started here and never again.
  // `startGeneration` is idempotent and non-throwing; the patch it returns is
  // already persisted, so nothing is handed back to the handler.
  onEventCreated: async (event) => {
    await worldService.startGeneration(event);
  },
});
