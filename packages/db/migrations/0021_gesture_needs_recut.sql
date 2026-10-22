ALTER TABLE `gesture` ADD `needs_recut` integer DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX `gesture_needs_recut_idx` ON `gesture` (`sort_name`,`id`) WHERE "needs_recut" = 1;