-- Phase 6 task 6: the admin sponsorship list and the CSV export read
-- `sponsorship` in `(created_at, id)` keyset order (newest first for the
-- list, oldest first for the export). CREATE INDEX only: no table rebuild,
-- and safe on existing rows.
CREATE INDEX `sponsorship_created_id_idx` ON `sponsorship` (`created_at`,`id`);