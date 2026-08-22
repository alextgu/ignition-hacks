import { createD1EventsRepository } from "../../../../src/features/events/repository";
import { createEventService } from "../../../../src/features/events/service";
import { createManageHandler } from "./handler";

const handle = createManageHandler(
  createEventService(createD1EventsRepository()),
);

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { token } = await context.params;
  return handle(request, token);
}
