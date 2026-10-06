CREATE TABLE `lounge_passes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`network` text NOT NULL,
	`plan` text,
	`number` text NOT NULL,
	`free_visits` integer,
	`used_before` integer DEFAULT 0 NOT NULL,
	`renews_on` text,
	`extra_visit_cents` integer,
	`guest_cents` integer,
	`currency` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `lounge_visits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`journey_id` text,
	`lounge_id` text NOT NULL,
	`lounge_name` text NOT NULL,
	`airport` text NOT NULL,
	`way` text NOT NULL,
	`pass_id` text,
	`guests` integer DEFAULT 0 NOT NULL,
	`paid_cents` integer,
	`currency` text,
	`entered_at` text NOT NULL,
	`left_at` text,
	`leave_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
