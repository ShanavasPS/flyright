CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`programme` text NOT NULL,
	`custom_airline` text,
	`custom_programme` text,
	`number` text NOT NULL,
	`tier` text,
	`balance` integer,
	`qualifying` integer,
	`qualifying_target` integer,
	`tier_until` text,
	`expiring_amount` integer,
	`expiring_on` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
