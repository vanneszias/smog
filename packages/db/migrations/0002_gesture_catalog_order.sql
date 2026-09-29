DROP INDEX `gesture_published_name_idx`;--> statement-breakpoint
-- Hand-edited: SQLite cannot ADD a NOT NULL column without a default. The
-- schema has no default (every insert must pass `gestureSortName(name)`);
-- the '' default only exists for this ALTER. Existing rows get lower(name)
-- (SQL cannot strip accents); re-running the seed or the data migration
-- writes the exact `normalizeText` value.
ALTER TABLE `gesture` ADD `sort_name` text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `gesture` SET `sort_name` = lower(`name`);--> statement-breakpoint
CREATE INDEX `gesture_published_sort_name_idx` ON `gesture` (`sort_name`,`id`) WHERE "published_at" IS NOT NULL;
