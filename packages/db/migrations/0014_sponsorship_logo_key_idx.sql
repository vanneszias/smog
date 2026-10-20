-- Phase 9 task 6: the orphan-logo sweep asks, per candidate key, whether
-- another sponsorship still uses it (`logo_key = ?`); without an index each
-- key scanned the table. CREATE INDEX only: no rebuild, safe on existing rows.
CREATE INDEX `sponsorship_logo_key_idx` ON `sponsorship` (`logo_key`);
