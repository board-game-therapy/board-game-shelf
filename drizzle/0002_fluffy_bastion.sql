ALTER TABLE `games` ADD `catalog_snapshot` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `games` ADD `archived` integer DEFAULT 0 NOT NULL;