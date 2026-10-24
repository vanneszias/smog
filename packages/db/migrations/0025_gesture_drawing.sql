-- Phase 10c task 1: the drawings of a gesture (private, one per step).
CREATE TABLE `gesture_drawing` (
	`gesture_id` text NOT NULL,
	`step` integer NOT NULL,
	`r2_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`credit` text DEFAULT '' NOT NULL,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`gesture_id`, `step`),
	FOREIGN KEY (`gesture_id`) REFERENCES `gesture`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "gesture_drawing_step_check" CHECK("step" IN (1, 2)),
	CONSTRAINT "gesture_drawing_content_type_check" CHECK("content_type" IN ('image/png', 'image/jpeg', 'image/webp')),
	CONSTRAINT "gesture_drawing_size_check" CHECK("size" BETWEEN 1 AND 1048576),
	CONSTRAINT "gesture_drawing_width_check" CHECK("width" BETWEEN 1 AND 2000),
	CONSTRAINT "gesture_drawing_height_check" CHECK("height" BETWEEN 1 AND 2000),
	CONSTRAINT "gesture_drawing_credit_check" CHECK(length("credit") <= 120)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gesture_drawing_r2_key_unique` ON `gesture_drawing` (`r2_key`);--> statement-breakpoint
CREATE INDEX `gesture_drawing_updated_by_idx` ON `gesture_drawing` (`updated_by`);