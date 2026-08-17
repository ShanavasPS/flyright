ALTER TABLE `journeys` ADD `source` text DEFAULT 'lookup' NOT NULL;--> statement-breakpoint
ALTER TABLE `journeys` ADD `updated_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `journeys` ADD `deleted_at` text;