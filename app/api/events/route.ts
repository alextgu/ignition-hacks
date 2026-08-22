import { createD1EventsRepository } from "../../../src/features/events/repository";
import { createEventService } from "../../../src/features/events/service";
import { createEventHandler } from "./handler";

export const POST = createEventHandler(
  createEventService(createD1EventsRepository()),
);
