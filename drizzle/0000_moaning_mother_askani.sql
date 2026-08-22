CREATE TABLE `attendees` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`guest_id` text NOT NULL,
	`display_name` text NOT NULL,
	`selected_time_options_json` text NOT NULL,
	`price_response` text NOT NULL,
	`avatar_index` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_attendees_event_guest` ON `attendees` (`event_id`,`guest_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`public_slug` text NOT NULL,
	`management_token` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`location` text NOT NULL,
	`group_size` integer NOT NULL,
	`price_min` integer NOT NULL,
	`price_max` integer NOT NULL,
	`time_options_json` text NOT NULL,
	`status` text DEFAULT 'coordinating' NOT NULL,
	`world_status` text DEFAULT 'pending' NOT NULL,
	`world_embed_url` text,
	`world_preview_image_url` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_public_slug_unique` ON `events` (`public_slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `events_management_token_unique` ON `events` (`management_token`);