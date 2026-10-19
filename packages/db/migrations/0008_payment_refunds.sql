-- Phase 6 (rulings 4 and 9): Mollie's refunded amount on each payment, and
-- the indexes the daily retention purge seeks. ADD COLUMN with a constant
-- default and CREATE INDEX only: no table rebuild, and every existing
-- payment reads refunded_cents = 0, so it is safe on the staging data.
ALTER TABLE `payment` ADD `refunded_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `payment` ADD `refunded_at` integer;--> statement-breakpoint
CREATE INDEX `session_expires_at_idx` ON `session` (`expires_at`);--> statement-breakpoint
CREATE INDEX `verification_expires_at_idx` ON `verification` (`expires_at`);
