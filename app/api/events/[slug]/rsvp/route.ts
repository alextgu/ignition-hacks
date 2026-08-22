import { createD1EventsRepository } from "../../../../../src/features/events/repository";
import { createEventService } from "../../../../../src/features/events/service";
import { createRsvpHandlers } from "./handler";

const handlers = createRsvpHandlers(
  createEventService(createD1EventsRepository()),
);

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  return handlers.get(request, slug);
}

export async function PUT(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  return handlers.put(request, slug);
}
