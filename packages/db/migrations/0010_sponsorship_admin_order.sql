-- Phase 6 task 6: the admin sponsorship list and the CSV export read
-- `sponsorship` in `(created_at, id)` keyset order (newest first for the
-- list, oldest first for the export), and the admin user panel finds an
-- account's sponsors by `lower(email)`. CREATE INDEX only: no table
-- rebuild, and safe on existing rows.
CREATE INDEX `sponsor_email_lower_idx` ON `sponsor` (lower("email"));--> statement-breakpoint
CREATE INDEX `sponsorship_created_id_idx` ON `sponsorship` (`created_at`,`id`);