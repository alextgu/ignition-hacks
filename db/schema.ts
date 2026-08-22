import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  publicSlug: text("public_slug").notNull().unique(),
  managementToken: text("management_token").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  location: text("location").notNull(),
  groupSize: integer("group_size").notNull(),
  priceMin: integer("price_min").notNull(),
  priceMax: integer("price_max").notNull(),
  timeOptionsJson: text("time_options_json").notNull(),
  status: text("status").notNull().default("coordinating"),
  worldStatus: text("world_status").notNull().default("pending"),
  worldEmbedUrl: text("world_embed_url"),
  worldPreviewImageUrl: text("world_preview_image_url"),
  // World Labs generation state. All nullable: an event is fully usable
  // before, during and after generation, and may never have a world at all.
  worldExternalId: text("world_external_id"),
  worldPanoUrl: text("world_pano_url"),
  worldSplatLowUrl: text("world_splat_low_url"),
  worldSplatMediumUrl: text("world_splat_medium_url"),
  worldCaption: text("world_caption"),
  worldError: text("world_error"),
  worldStartedAt: text("world_started_at"),
  worldCompletedAt: text("world_completed_at"),
  worldLastCheckedAt: text("world_last_checked_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const attendees = sqliteTable(
  "attendees",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    guestId: text("guest_id").notNull(),
    displayName: text("display_name").notNull(),
    selectedTimeOptionsJson: text("selected_time_options_json").notNull(),
    priceResponse: text("price_response").notNull(),
    avatarIndex: integer("avatar_index").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_attendees_event_guest").on(
      table.eventId,
      table.guestId,
    ),
  ],
);

export const invitations = sqliteTable("invitations", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  token: text("invitation_token").notNull().unique(),
  suggestedName: text("suggested_name").notNull(),
  createdAt: text("created_at").notNull(),
});
