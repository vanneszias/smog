-- Phase 6 task 3 fix round 1 (I-3): Mollie's charged-back amount on each
-- payment. ADD COLUMN with a constant default only: no table rebuild, and
-- every existing payment reads charged_back_cents = 0, so it is safe on the
-- staging data.
ALTER TABLE `payment` ADD `charged_back_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `payment` ADD `charged_back_at` integer;