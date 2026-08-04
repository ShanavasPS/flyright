CREATE TABLE `claims` (
	`id` text PRIMARY KEY NOT NULL,
	`journey_id` text NOT NULL,
	`regulation` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`sent_at` text,
	`response_deadline` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `disruptions` (
	`id` text PRIMARY KEY NOT NULL,
	`journey_id` text NOT NULL,
	`type` text NOT NULL,
	`delay_minutes` integer,
	`notice_days` integer,
	`extraordinary` integer,
	`detected_at` text NOT NULL,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`kind` text NOT NULL,
	`uri` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `journeys` (
	`id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`carrier` text NOT NULL,
	`carrier_country` text NOT NULL,
	`number` text NOT NULL,
	`from_code` text NOT NULL,
	`from_country` text NOT NULL,
	`to_code` text NOT NULL,
	`to_country` text NOT NULL,
	`distance_km` real NOT NULL,
	`scheduled_departure` text NOT NULL,
	`scheduled_arrival` text NOT NULL,
	`ticket_price_amount` real,
	`ticket_price_currency` text,
	`created_at` text NOT NULL
);
