CREATE TABLE `travel_day` (
	`journey_id` text PRIMARY KEY NOT NULL,
	`stage` text,
	`stamps` text DEFAULT '{}' NOT NULL,
	`activity_started_at` text,
	`ended_at` text,
	`updated_at` text NOT NULL,
	`synced_at` text,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE no action
);
