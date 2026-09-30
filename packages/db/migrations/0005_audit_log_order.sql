DROP INDEX `audit_log_target_idx`;--> statement-breakpoint
DROP INDEX `audit_log_actor_id_idx`;--> statement-breakpoint
CREATE INDEX `audit_log_type_created_idx` ON `audit_log` (`target_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_log_target_created_idx` ON `audit_log` (`target_type`,`target_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_log_actor_created_idx` ON `audit_log` (`actor_id`,`created_at`);