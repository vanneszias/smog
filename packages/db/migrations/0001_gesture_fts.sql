-- Hand-written (drizzle-kit does not model virtual tables); registered in
-- meta/_journal.json with `drizzle-kit generate --custom`.
--
-- Full-text search over published and unpublished gestures (spec §5.2).
-- One row per gesture, maintained by the gestures service: `reindexGesture`
-- runs in the same D1 batch as every write to a gesture, its keywords or its
-- categories. `keywords` and `categories` are the names joined by spaces.
-- `unicode61 remove_diacritics 2` folds case and strips accents from every
-- Latin letter (`cafe` matches `café`). Prefix queries (`hond*`) use the
-- `prefix` indexes for 2- and 3-character prefixes.
CREATE VIRTUAL TABLE `gesture_fts` USING fts5(
	gesture_id UNINDEXED,
	name,
	keywords,
	categories,
	description,
	tokenize = 'unicode61 remove_diacritics 2',
	prefix = '2 3'
);
