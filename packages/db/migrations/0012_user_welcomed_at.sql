-- Phase 8 ruling 16 (carry 6): the welcome email is claimed once in D1.
-- `welcome()` runs `UPDATE user SET welcomed_at = ? WHERE id = ? AND
-- welcomed_at IS NULL RETURNING id` and enqueues only when a row comes
-- back, so two concurrent verifications send one welcome.
--
-- ADD COLUMN only: no table rebuild, so 0007's `user_keep_one_admin`
-- trigger survives. The backfill (by hand, below the generated ALTER)
-- marks every verified account as welcomed at its `updated_at`: it was
-- welcomed already, or verified before the welcome email existed. It
-- writes `welcomed_at` only, never `role`, so the `BEFORE UPDATE OF role`
-- trigger does not fire and it is safe on a database with one admin.
-- Unverified accounts stay NULL and are welcomed when they verify.
ALTER TABLE `user` ADD `welcomed_at` integer;--> statement-breakpoint
UPDATE `user` SET `welcomed_at` = `updated_at` WHERE `email_verified` = 1;
