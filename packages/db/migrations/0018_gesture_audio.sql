CREATE TABLE `gesture_audio` (
	`gesture_id` text NOT NULL,
	`locale` text NOT NULL,
	`r2_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`gesture_id`, `locale`),
	FOREIGN KEY (`gesture_id`) REFERENCES `gesture`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`locale`) REFERENCES `language`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "gesture_audio_content_type_check" CHECK("content_type" IN ('audio/mpeg', 'audio/mp4')),
	CONSTRAINT "gesture_audio_size_check" CHECK("size" BETWEEN 1 AND 1048576),
	CONSTRAINT "gesture_audio_duration_check" CHECK("duration_ms" BETWEEN 1 AND 10000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gesture_audio_r2_key_unique` ON `gesture_audio` (`r2_key`);--> statement-breakpoint
CREATE INDEX `gesture_audio_locale_idx` ON `gesture_audio` (`locale`,`gesture_id`);--> statement-breakpoint
CREATE INDEX `gesture_audio_updated_by_idx` ON `gesture_audio` (`updated_by`);