CREATE TABLE `trip_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`journey_id` text NOT NULL,
	`user_id` text,
	`uri` text NOT NULL,
	`name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`storage_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`synced_at` text,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE no action
);
