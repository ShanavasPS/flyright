CREATE TABLE `trip_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`journey_id` text NOT NULL,
	`user_id` text,
	`uri` text NOT NULL,
	`width` integer,
	`height` integer,
	`storage_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`synced_at` text,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `journeys` ADD `rating` integer;--> statement-breakpoint
ALTER TABLE `journeys` ADD `booking_reference` text;--> statement-breakpoint
ALTER TABLE `journeys` ADD `seat` text;