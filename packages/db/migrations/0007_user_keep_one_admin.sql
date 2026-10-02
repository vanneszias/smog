-- Hand-written (drizzle-kit does not model triggers); registered in
-- meta/_journal.json with `drizzle-kit generate --custom`.
--
-- Ruling 7, made atomic: a role change never leaves the site without an
-- admin whose ban is not in force. D1 runs one write at a time and the
-- trigger runs inside the writing statement, so two admins demoting each
-- other at the same moment cannot both succeed (the second is aborted with
-- `last_admin`, which `admin.users.setRole` answers as `INVALID_STATE`
-- `lastAdmin`). It covers Better Auth's `setRole`, `admin:grant` and raw
-- SQL alike. Creating it changes no row, so it is safe on existing data,
-- including a database with exactly one admin. Account deletion is guarded
-- in `account.delete` instead (a delete trigger would block test cleanups).
CREATE TRIGGER `user_keep_one_admin`
BEFORE UPDATE OF `role` ON `user`
WHEN OLD.`role` = 'admin' AND NEW.`role` <> 'admin' AND NOT EXISTS (
	SELECT 1 FROM `user` AS `other`
	WHERE `other`.`role` = 'admin'
		AND `other`.`id` <> OLD.`id`
		AND NOT (
			coalesce(`other`.`banned`, 0) = 1
			AND (
				`other`.`ban_expires` IS NULL
				OR `other`.`ban_expires` > CAST(unixepoch('subsec') * 1000 AS INTEGER)
			)
		)
)
BEGIN
	SELECT RAISE(ABORT, 'last_admin');
END;
