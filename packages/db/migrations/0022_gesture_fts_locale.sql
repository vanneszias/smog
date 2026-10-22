-- Hand-written (drizzle-kit does not model virtual tables); registered in
-- meta/_journal.json with `drizzle-kit generate --custom`.
--
-- Phase 10b task 1: `gesture_fts` becomes one row per (gesture, language).
-- FTS5 cannot add a column, so the table is dropped and created again with
-- `locale` as the LAST column (UNINDEXED), which keeps the column positions
-- of the bm25 weights in the search query (gesture_id, name, keywords,
-- categories, description). Every existing row is copied through a backup
-- table and becomes a row of the default language (nl). A gesture that had
-- no row (an index that drifted) gets one from the tables, with the same
-- definition as packages/db/src/fts.ts: name, keywords of the default
-- language, names of the published categories and the description.
-- Rows of other languages are written with the translations (none exist yet).
CREATE TABLE `_bk_gesture_fts` AS SELECT `gesture_id`, `name`, `keywords`, `categories`, `description` FROM `gesture_fts`;--> statement-breakpoint
DROP TABLE `gesture_fts`;--> statement-breakpoint
CREATE VIRTUAL TABLE `gesture_fts` USING fts5(
	gesture_id UNINDEXED,
	name,
	keywords,
	categories,
	description,
	locale UNINDEXED,
	tokenize = 'unicode61 remove_diacritics 2',
	prefix = '2 3'
);--> statement-breakpoint
INSERT INTO `gesture_fts` (`gesture_id`, `name`, `keywords`, `categories`, `description`, `locale`) SELECT `gesture_id`, `name`, `keywords`, `categories`, `description`, (SELECT `code` FROM `language` WHERE `is_default` = 1) FROM `_bk_gesture_fts`;--> statement-breakpoint
INSERT INTO `gesture_fts` (`gesture_id`, `name`, `keywords`, `categories`, `description`, `locale`) SELECT `gesture`.`id`, `gesture`.`name`, coalesce((SELECT group_concat(`gesture_keyword`.`keyword`, ' ') FROM `gesture_keyword` WHERE `gesture_keyword`.`gesture_id` = `gesture`.`id` AND `gesture_keyword`.`locale` = (SELECT `code` FROM `language` WHERE `is_default` = 1)), ''), coalesce((SELECT group_concat(`category`.`name`, ' ') FROM `gesture_category` JOIN `category` ON `category`.`id` = `gesture_category`.`category_id` WHERE `gesture_category`.`gesture_id` = `gesture`.`id` AND `category`.`published_at` IS NOT NULL), ''), `gesture`.`description`, (SELECT `code` FROM `language` WHERE `is_default` = 1) FROM `gesture` WHERE `gesture`.`id` NOT IN (SELECT `gesture_id` FROM `_bk_gesture_fts`);--> statement-breakpoint
DROP TABLE `_bk_gesture_fts`;
