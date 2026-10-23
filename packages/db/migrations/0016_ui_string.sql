CREATE TABLE `ui_string` (
	`locale` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`source_hash` text,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`locale`, `key`),
	FOREIGN KEY (`locale`) REFERENCES `language`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ui_string_key_length_check" CHECK(length("key") BETWEEN 1 AND 200),
	CONSTRAINT "ui_string_value_length_check" CHECK(length("value") BETWEEN 1 AND 4000)
);
--> statement-breakpoint
CREATE INDEX `ui_string_updated_by_idx` ON `ui_string` (`updated_by`);