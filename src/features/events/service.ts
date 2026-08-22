import type {
  AttendeeRecord,
  EventRecord,
  UpsertAttendeeInput,
} from "./contracts";
import { createManagementToken, createPublicSlug } from "./ids";
import type { EventsRepository } from "./repository";
import { parseAttendeeInput, parseCreateEventInput } from "./validation";

export type EventServiceDependencies = {
  newId: () => string;
  newPublicSlug: (title: string) => string;
  newManagementToken: () => string;
  now: () => string;
};

export const defaultEventServiceDependencies: EventServiceDependencies = {
  newId: () => crypto.randomUUID(),
  newPublicSlug: createPublicSlug,
  newManagementToken: createManagementToken,
  now: () => new Date().toISOString(),
};

export function createEventService(
  repository: EventsRepository,
  dependencies: EventServiceDependencies = defaultEventServiceDependencies,
) {
  return {
    async createEvent(input: unknown) {
      const parsed = parseCreateEventInput(input);
      if (!parsed.ok) return parsed;

      const createdAt = dependencies.now();
      const publicSlug = dependencies.newPublicSlug(parsed.value.title);
      let managementToken = dependencies.newManagementToken();
      if (managementToken === publicSlug) {
        managementToken = dependencies.newManagementToken();
      }
      const event: EventRecord = {
        ...parsed.value,
        id: dependencies.newId(),
        publicSlug,
        managementToken,
        status: "coordinating",
        worldStatus: "pending",
        worldEmbedUrl: null,
        worldPreviewImageUrl: null,
        createdAt,
        updatedAt: createdAt,
      };
      await repository.insertEvent(event);
      return { ok: true as const, event };
    },

    getEventBySlug(slug: string) {
      return repository.findEventBySlug(slug);
    },

    async getManagedEvent(token: string) {
      const event = await repository.findEventByManagementToken(token);
      if (!event) return null;
      return {
        event,
        attendees: await repository.listAttendees(event.id),
      };
    },

    async getGuestResponse(slug: string, guestId: string) {
      const event = await repository.findEventBySlug(slug);
      if (!event) return null;
      return {
        event,
        attendee: await repository.findAttendee(event.id, guestId),
      };
    },

    async upsertGuestResponse(
      slug: string,
      guestId: string,
      input: UpsertAttendeeInput | unknown,
    ) {
      const event = await repository.findEventBySlug(slug);
      if (!event) return { ok: false as const, error: "Event not found." };

      const parsed = parseAttendeeInput(input);
      if (!parsed.ok) return parsed;
      if (
        parsed.value.selectedTimeOptions.some(
          (option) => !event.timeOptions.includes(option),
        )
      ) {
        return {
          ok: false as const,
          error: "Choose a time offered by this event.",
        };
      }

      const existing = await repository.findAttendee(event.id, guestId);
      const now = dependencies.now();
      let avatarIndex = existing?.avatarIndex;
      if (avatarIndex === undefined) {
        avatarIndex = (await repository.listAttendees(event.id)).length % 8;
      }
      const attendee: AttendeeRecord = {
        id: existing?.id ?? dependencies.newId(),
        eventId: event.id,
        guestId,
        ...parsed.value,
        avatarIndex,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      return {
        ok: true as const,
        attendee: await repository.upsertAttendee(attendee),
      };
    },
  };
}
