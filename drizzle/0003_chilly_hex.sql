ALTER TABLE `journeys` ADD `synced_at` text;--> statement-breakpoint
UPDATE `journeys` SET `updated_at` = `created_at` WHERE `updated_at` = '';
