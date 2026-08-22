import { and, eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { attendees, events, invitations } from "../../../db/schema";
import type {
  AttendeeRecord,
  EventRecord,
  InvitationRecord,
  PriceResponse,
} from "./contracts";

export type EventsRepository = {
  insertEvent(event: EventRecord): Promise<void>;
  findEventBySlug(slug: string): Promise<EventRecord | null>;
  findEventByManagementToken(token: string): Promise<EventRecord | null>;
  findAttendee(eventId: string, guestId: string): Promise<AttendeeRecord | null>;
  listAttendees(eventId: string): Promise<AttendeeRecord[]>;
  upsertAttendee(attendee: AttendeeRecord): Promise<AttendeeRecord>;
  insertInvitations(
    records: InvitationRecord[],
  ): Promise<InvitationRecord[]>;
  findInvitation(
    eventId: string,
    token: string,
  ): Promise<InvitationRecord | null>;
  listInvitations(eventId: string): Promise<InvitationRecord[]>;
};

type EventRow = typeof events.$inferSelect;
type AttendeeRow = typeof attendees.$inferSelect;
type InvitationRow = typeof invitations.$inferSelect;

function toEventRecord(row: EventRow): EventRecord {
  return {
    id: row.id,
    publicSlug: row.publicSlug,
    managementToken: row.managementToken,
    title: row.title,
    description: row.description,
    location: row.location,
    groupSize: row.groupSize,
    priceMin: row.priceMin,
    priceMax: row.priceMax,
    timeOptions: JSON.parse(row.timeOptionsJson) as string[],
    status: row.status as EventRecord["status"],
    worldStatus: row.worldStatus as EventRecord["worldStatus"],
    worldEmbedUrl: row.worldEmbedUrl,
    worldPreviewImageUrl: row.worldPreviewImageUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toAttendeeRecord(row: AttendeeRow): AttendeeRecord {
  return {
    id: row.id,
    eventId: row.eventId,
    guestId: row.guestId,
    displayName: row.displayName,
    selectedTimeOptions: JSON.parse(row.selectedTimeOptionsJson) as string[],
    priceResponse: row.priceResponse as PriceResponse,
    avatarIndex: row.avatarIndex,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toInvitationRecord(row: InvitationRow): InvitationRecord {
  return {
    id: row.id,
    eventId: row.eventId,
    token: row.token,
    suggestedName: row.suggestedName,
    createdAt: row.createdAt,
  };
}

export function createD1EventsRepository(
  database: ReturnType<typeof getDb> = getDb(),
  ensureReady: () => Promise<void> = ensureDatabase,
): EventsRepository {
  return {
    async insertEvent(event) {
      await ensureReady();
      await database.insert(events).values({
        id: event.id,
        publicSlug: event.publicSlug,
        managementToken: event.managementToken,
        title: event.title,
        description: event.description,
        location: event.location,
        groupSize: event.groupSize,
        priceMin: event.priceMin,
        priceMax: event.priceMax,
        timeOptionsJson: JSON.stringify(event.timeOptions),
        status: event.status,
        worldStatus: event.worldStatus,
        worldEmbedUrl: event.worldEmbedUrl,
        worldPreviewImageUrl: event.worldPreviewImageUrl,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      });
    },

    async findEventBySlug(slug) {
      await ensureReady();
      const [row] = await database
        .select()
        .from(events)
        .where(eq(events.publicSlug, slug))
        .limit(1);
      return row ? toEventRecord(row) : null;
    },

    async findEventByManagementToken(token) {
      await ensureReady();
      const [row] = await database
        .select()
        .from(events)
        .where(eq(events.managementToken, token))
        .limit(1);
      return row ? toEventRecord(row) : null;
    },

    async findAttendee(eventId, guestId) {
      await ensureReady();
      const [row] = await database
        .select()
        .from(attendees)
        .where(
          and(
            eq(attendees.eventId, eventId),
            eq(attendees.guestId, guestId),
          ),
        )
        .limit(1);
      return row ? toAttendeeRecord(row) : null;
    },

    async listAttendees(eventId) {
      await ensureReady();
      const rows = await database
        .select()
        .from(attendees)
        .where(eq(attendees.eventId, eventId));
      return rows.map(toAttendeeRecord);
    },

    async upsertAttendee(attendee) {
      await ensureReady();
      const values = {
        id: attendee.id,
        eventId: attendee.eventId,
        guestId: attendee.guestId,
        displayName: attendee.displayName,
        selectedTimeOptionsJson: JSON.stringify(attendee.selectedTimeOptions),
        priceResponse: attendee.priceResponse,
        avatarIndex: attendee.avatarIndex,
        createdAt: attendee.createdAt,
        updatedAt: attendee.updatedAt,
      };
      await database
        .insert(attendees)
        .values(values)
        .onConflictDoUpdate({
          target: [attendees.eventId, attendees.guestId],
          set: {
            displayName: values.displayName,
            selectedTimeOptionsJson: values.selectedTimeOptionsJson,
            priceResponse: values.priceResponse,
            updatedAt: values.updatedAt,
          },
        });
      const saved = await this.findAttendee(attendee.eventId, attendee.guestId);
      if (!saved) throw new Error("Attendee upsert did not return a record.");
      return saved;
    },

    async insertInvitations(records) {
      await ensureReady();
      if (records.length === 0) return [];
      await database.insert(invitations).values(records);
      return records;
    },

    async findInvitation(eventId, token) {
      await ensureReady();
      const [row] = await database
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.eventId, eventId),
            eq(invitations.token, token),
          ),
        )
        .limit(1);
      return row ? toInvitationRecord(row) : null;
    },

    async listInvitations(eventId) {
      await ensureReady();
      const rows = await database
        .select()
        .from(invitations)
        .where(eq(invitations.eventId, eventId));
      return rows.map(toInvitationRecord);
    },
  };
}
