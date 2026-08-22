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
