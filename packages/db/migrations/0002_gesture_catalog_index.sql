DROP INDEX `gesture_published_name_idx`;--> statement-breakpoint
CREATE INDEX `gesture_published_name_idx` ON `gesture` ("name" COLLATE NOCASE,`id`) WHERE "published_at" IS NOT NULL;