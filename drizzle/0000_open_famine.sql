CREATE TABLE `catalog_state` (
	`id` integer PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`category` text DEFAULT 'Uncategorized' NOT NULL,
	`confidence` text DEFAULT 'confirmed' NOT NULL,
	`kind` text DEFAULT 'game' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL
);
