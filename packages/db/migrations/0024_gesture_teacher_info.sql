-- Phase 10c task 1: private teaching information of a gesture, per language.
CREATE TABLE `gesture_teacher_info` (
	`gesture_id` text NOT NULL,
	`locale` text NOT NULL,
	`hc` text DEFAULT '' NOT NULL,
	`pl` text DEFAULT '' NOT NULL,
	`or_` text DEFAULT '' NOT NULL,
	`bw` text DEFAULT '' NOT NULL,
	`c_note` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`gesture_id`, `locale`),
	FOREIGN KEY (`gesture_id`) REFERENCES `gesture`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`locale`) REFERENCES `language`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "gesture_teacher_info_hc_check" CHECK(length("hc") <= 2000),
	CONSTRAINT "gesture_teacher_info_pl_check" CHECK(length("pl") <= 2000),
	CONSTRAINT "gesture_teacher_info_or_check" CHECK(length("or_") <= 2000),
	CONSTRAINT "gesture_teacher_info_bw_check" CHECK(length("bw") <= 2000),
	CONSTRAINT "gesture_teacher_info_c_note_check" CHECK(length("c_note") <= 2000),
	CONSTRAINT "gesture_teacher_info_note_check" CHECK(length("note") <= 2000),
	CONSTRAINT "gesture_teacher_info_summary_check" CHECK(length("summary") <= 2000),
	CONSTRAINT "gesture_teacher_info_version_check" CHECK("version" >= 1)
);
--> statement-breakpoint
CREATE INDEX `gesture_teacher_info_locale_idx` ON `gesture_teacher_info` (`locale`,`gesture_id`);--> statement-breakpoint
CREATE INDEX `gesture_teacher_info_updated_by_idx` ON `gesture_teacher_info` (`updated_by`);