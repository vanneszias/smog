-- Phase 10c task 1: lessons, their sections, items and per-language titles.
CREATE TABLE `lesson` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text,
	`number` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "lesson_number_check" CHECK("number" IS NULL OR "number" BETWEEN 0 AND 9999),
	CONSTRAINT "lesson_version_check" CHECK("version" >= 1)
);
--> statement-breakpoint
CREATE INDEX `lesson_updated_idx` ON `lesson` (`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `lesson_author_updated_idx` ON `lesson` (`author_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `lesson_item` (
	`lesson_id` text NOT NULL,
	`section_id` text,
	`gesture_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`lesson_id`, `gesture_id`),
	FOREIGN KEY (`lesson_id`) REFERENCES `lesson`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`section_id`) REFERENCES `lesson_section`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`gesture_id`) REFERENCES `gesture`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "lesson_item_position_check" CHECK("position" >= 0)
);
--> statement-breakpoint
CREATE INDEX `lesson_item_order_idx` ON `lesson_item` (`lesson_id`,`section_id`,`position`);--> statement-breakpoint
CREATE INDEX `lesson_item_section_idx` ON `lesson_item` (`section_id`);--> statement-breakpoint
CREATE INDEX `lesson_item_gesture_idx` ON `lesson_item` (`gesture_id`,`lesson_id`);--> statement-breakpoint
CREATE TABLE `lesson_section` (
	`id` text PRIMARY KEY NOT NULL,
	`lesson_id` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`lesson_id`) REFERENCES `lesson`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "lesson_section_position_check" CHECK("position" >= 0)
);
--> statement-breakpoint
CREATE INDEX `lesson_section_order_idx` ON `lesson_section` (`lesson_id`,`position`);--> statement-breakpoint
CREATE TABLE `lesson_section_translation` (
	`section_id` text NOT NULL,
	`locale` text NOT NULL,
	`title` text NOT NULL,
	PRIMARY KEY(`section_id`, `locale`),
	FOREIGN KEY (`section_id`) REFERENCES `lesson_section`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`locale`) REFERENCES `language`(`code`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "lesson_section_translation_title_check" CHECK(length("title") BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE INDEX `lesson_section_translation_locale_idx` ON `lesson_section_translation` (`locale`,`section_id`);--> statement-breakpoint
CREATE TABLE `lesson_translation` (
	`lesson_id` text NOT NULL,
	`locale` text NOT NULL,
	`title` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`lesson_id`, `locale`),
	FOREIGN KEY (`lesson_id`) REFERENCES `lesson`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`locale`) REFERENCES `language`(`code`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "lesson_translation_title_check" CHECK(length("title") BETWEEN 1 AND 200),
	CONSTRAINT "lesson_translation_notes_check" CHECK(length("notes") <= 2000)
);
--> statement-breakpoint
CREATE INDEX `lesson_translation_locale_idx` ON `lesson_translation` (`locale`,`lesson_id`);