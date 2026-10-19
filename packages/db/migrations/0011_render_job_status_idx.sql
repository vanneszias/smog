-- Phase 7 task 1: the render watchdog (ruling 12) reads the `queued` and
-- `running` render jobs oldest first, at most 50 per run, each status a
-- seek on `(status, updated_at)`. CREATE INDEX only: no table rebuild, and
-- safe on existing rows.
CREATE INDEX `render_job_status_updated_idx` ON `render_job` (`status`,`updated_at`);
