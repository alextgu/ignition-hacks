CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`invitation_token` text NOT NULL,
	`suggested_name` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_invitation_token_unique` ON `invitations` (`invitation_token`);