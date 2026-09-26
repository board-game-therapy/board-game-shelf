ALTER TABLE `games` ADD `catalog_key` text;--> statement-breakpoint
ALTER TABLE `games` ADD `tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `games` ADD `evidence` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `games_catalog_key_unique` ON `games` (`catalog_key`);