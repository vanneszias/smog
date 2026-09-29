CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `account_provider_account_idx` ON `account` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "audit_log_action_check" CHECK("action" IN ('gesture.create', 'gesture.update', 'gesture.publish', 'gesture.unpublish', 'gesture.delete', 'gesture.bulk_update', 'category.create', 'category.update', 'category.publish', 'category.unpublish', 'category.delete', 'user.role_change', 'user.ban', 'user.unban', 'user.delete', 'user.impersonate', 'sponsorship.approve', 'sponsorship.reject', 'sponsorship.request_changes', 'sponsorship.mark_paid', 'sponsorship.cancel', 'sponsorship.retry_render', 'sponsorship.force_expire', 'sponsorship.regenerate_token', 'payment.refund', 'legacy')),
	CONSTRAINT "audit_log_target_type_check" CHECK("target_type" IN ('gesture', 'category', 'user', 'sponsorship', 'payment', 'list'))
);
--> statement-breakpoint
CREATE INDEX `audit_log_created_at_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_log_target_idx` ON `audit_log` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `audit_log_action_created_idx` ON `audit_log` (`action`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_log_actor_id_idx` ON `audit_log` (`actor_id`);--> statement-breakpoint
CREATE TABLE `category` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`legacy_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_slug_unique` ON `category` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `category_legacy_id_unique` ON `category` (`legacy_id`);--> statement-breakpoint
CREATE INDEX `category_published_sort_idx` ON `category` (`published_at`,`sort_order`);--> statement-breakpoint
CREATE TABLE `consent_event` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`purpose` text NOT NULL,
	`granted` integer NOT NULL,
	`policy_version` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "consent_event_purpose_check" CHECK("purpose" IN ('analytics', 'marketing')),
	CONSTRAINT "consent_event_source_check" CHECK("source" IN ('web', 'mobile', 'import'))
);
--> statement-breakpoint
CREATE INDEX `consent_event_user_purpose_created_idx` ON `consent_event` (`user_id`,`purpose`,`created_at`);--> statement-breakpoint
CREATE TABLE `favorite` (
	`user_id` text NOT NULL,
	`gesture_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `gesture_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`gesture_id`) REFERENCES `gesture`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `favorite_gesture_id_idx` ON `favorite` (`gesture_id`);--> statement-breakpoint
CREATE TABLE `gesture` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`playback_id` text NOT NULL,
	`mux_asset_id` text,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`legacy_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gesture_slug_unique` ON `gesture` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `gesture_legacy_id_unique` ON `gesture` (`legacy_id`);--> statement-breakpoint
CREATE INDEX `gesture_published_name_idx` ON `gesture` (`published_at`,`name`);--> statement-breakpoint
CREATE INDEX `gesture_mux_asset_id_idx` ON `gesture` (`mux_asset_id`);--> statement-breakpoint
CREATE TABLE `gesture_category` (
	`gesture_id` text NOT NULL,
	`category_id` text NOT NULL,
	PRIMARY KEY(`gesture_id`, `category_id`),
	FOREIGN KEY (`gesture_id`) REFERENCES `gesture`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gesture_category_category_id_idx` ON `gesture_category` (`category_id`);--> statement-breakpoint
CREATE TABLE `gesture_keyword` (
	`gesture_id` text NOT NULL,
	`keyword` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`gesture_id`, `keyword`),
	FOREIGN KEY (`gesture_id`) REFERENCES `gesture`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `invoice_request` (
	`sponsor_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`vat_number` text NOT NULL,
	`email` text NOT NULL,
	FOREIGN KEY (`sponsor_id`) REFERENCES `sponsor`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "invoice_request_name_length_check" CHECK(length("name") BETWEEN 1 AND 160),
	CONSTRAINT "invoice_request_email_length_check" CHECK(length("email") BETWEEN 3 AND 254)
);
--> statement-breakpoint
CREATE TABLE `list` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "list_name_length_check" CHECK(length("name") BETWEEN 1 AND 80),
	CONSTRAINT "list_description_length_check" CHECK(length("description") BETWEEN 0 AND 280)
);
--> statement-breakpoint
CREATE INDEX `list_owner_updated_idx` ON `list` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `list_item` (
	`list_id` text NOT NULL,
	`gesture_id` text NOT NULL,
	`position` integer NOT NULL,
	`added_by` text,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`list_id`, `gesture_id`),
	FOREIGN KEY (`list_id`) REFERENCES `list`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`gesture_id`) REFERENCES `gesture`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`added_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `list_item_list_position_idx` ON `list_item` (`list_id`,`position`);--> statement-breakpoint
CREATE INDEX `list_item_gesture_id_idx` ON `list_item` (`gesture_id`);--> statement-breakpoint
CREATE INDEX `list_item_added_by_idx` ON `list_item` (`added_by`);--> statement-breakpoint
CREATE TABLE `list_share` (
	`id` text PRIMARY KEY NOT NULL,
	`list_id` text NOT NULL,
	`role` text NOT NULL,
	`token` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`list_id`) REFERENCES `list`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "list_share_role_check" CHECK("role" IN ('view', 'edit'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `list_share_token_unique` ON `list_share` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `list_share_active_role_uq` ON `list_share` (`list_id`,`role`) WHERE "revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX `list_share_list_id_idx` ON `list_share` (`list_id`);--> statement-breakpoint
CREATE INDEX `list_share_created_by_idx` ON `list_share` (`created_by`);--> statement-breakpoint
CREATE TABLE `passkey` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`public_key` text NOT NULL,
	`user_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`counter` integer NOT NULL,
	`device_type` text NOT NULL,
	`backed_up` integer NOT NULL,
	`transports` text,
	`created_at` integer,
	`aaguid` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `passkey_user_id_idx` ON `passkey` (`user_id`);--> statement-breakpoint
CREATE INDEX `passkey_credential_id_idx` ON `passkey` (`credential_id`);--> statement-breakpoint
CREATE TABLE `payment` (
	`id` text PRIMARY KEY NOT NULL,
	`mollie_id` text,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`checkout_url` text,
	`paid_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "payment_kind_check" CHECK("kind" IN ('initial', 'renewal')),
	CONSTRAINT "payment_status_check" CHECK("status" IN ('open', 'paid', 'failed', 'canceled', 'expired', 'refund_needed')),
	CONSTRAINT "payment_currency_check" CHECK("currency" = 'EUR'),
	CONSTRAINT "payment_amount_check" CHECK("amount_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_mollie_id_unique` ON `payment` (`mollie_id`);--> statement-breakpoint
CREATE INDEX `payment_status_created_idx` ON `payment` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `payment_item` (
	`payment_id` text NOT NULL,
	`sponsorship_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`includes_logo` integer NOT NULL,
	PRIMARY KEY(`payment_id`, `sponsorship_id`),
	FOREIGN KEY (`payment_id`) REFERENCES `payment`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sponsorship_id`) REFERENCES `sponsorship`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "payment_item_amount_check" CHECK("amount_cents" >= 0)
);
--> statement-breakpoint
CREATE INDEX `payment_item_sponsorship_id_idx` ON `payment_item` (`sponsorship_id`);--> statement-breakpoint
CREATE TABLE `render_job` (
	`id` text PRIMARY KEY NOT NULL,
	`sponsorship_id` text NOT NULL,
	`status` text NOT NULL,
	`workflow_instance_id` text NOT NULL,
	`input` text NOT NULL,
	`mux_upload_id` text,
	`mux_asset_id` text,
	`playback_id` text,
	`error` text,
	`attempt` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`sponsorship_id`) REFERENCES `sponsorship`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "render_job_status_check" CHECK("status" IN ('queued', 'running', 'succeeded', 'failed')),
	CONSTRAINT "render_job_attempt_check" CHECK("attempt" >= 1)
);
--> statement-breakpoint
CREATE INDEX `render_job_sponsorship_created_idx` ON `render_job` (`sponsorship_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `render_job_mux_upload_id_idx` ON `render_job` (`mux_upload_id`);--> statement-breakpoint
CREATE INDEX `render_job_mux_asset_id_idx` ON `render_job` (`mux_asset_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`impersonated_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `sponsor` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`company` text,
	`locale` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "sponsor_name_length_check" CHECK(length("name") BETWEEN 1 AND 120),
	CONSTRAINT "sponsor_email_length_check" CHECK(length("email") BETWEEN 3 AND 254),
	CONSTRAINT "sponsor_company_length_check" CHECK(length("company") BETWEEN 0 AND 120),
	CONSTRAINT "sponsor_locale_check" CHECK("locale" IN ('nl', 'en', 'fr'))
);
--> statement-breakpoint
CREATE INDEX `sponsor_email_idx` ON `sponsor` (`email`);--> statement-breakpoint
CREATE TABLE `sponsorship` (
	`id` text PRIMARY KEY NOT NULL,
	`sponsor_id` text NOT NULL,
	`gesture_id` text NOT NULL,
	`display_name` text NOT NULL,
	`logo_key` text,
	`status` text NOT NULL,
	`starts_at` integer,
	`ends_at` integer,
	`video_playback_id` text,
	`video_asset_id` text,
	`reminder_sent_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`legacy_id` text,
	FOREIGN KEY (`sponsor_id`) REFERENCES `sponsor`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`gesture_id`) REFERENCES `gesture`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "sponsorship_status_check" CHECK("status" IN ('awaiting_payment', 'rendering', 'render_failed', 'in_review', 'changes_requested', 'live', 'expiring', 'rejected', 'cancelled', 'expired')),
	CONSTRAINT "sponsorship_display_name_length_check" CHECK(length("display_name") BETWEEN 1 AND 35)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sponsorship_legacy_id_unique` ON `sponsorship` (`legacy_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sponsorship_gesture_blocking_uq` ON `sponsorship` (`gesture_id`) WHERE "status" IN ('awaiting_payment', 'rendering', 'render_failed', 'in_review', 'changes_requested', 'live', 'expiring');--> statement-breakpoint
CREATE INDEX `sponsorship_gesture_status_idx` ON `sponsorship` (`gesture_id`,`status`);--> statement-breakpoint
CREATE INDEX `sponsorship_status_ends_at_idx` ON `sponsorship` (`status`,`ends_at`);--> statement-breakpoint
CREATE INDEX `sponsorship_sponsor_id_idx` ON `sponsorship` (`sponsor_id`);--> statement-breakpoint
CREATE TABLE `sponsorship_event` (
	`id` text PRIMARY KEY NOT NULL,
	`sponsorship_id` text NOT NULL,
	`type` text NOT NULL,
	`actor_id` text,
	`data` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`sponsorship_id`) REFERENCES `sponsorship`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "sponsorship_event_type_check" CHECK("type" IN ('created', 'payment_paid', 'payment_failed', 'marked_paid_manually', 'render_started', 'render_succeeded', 'render_failed', 'render_retried', 'approved', 'rejected', 'changes_requested', 'resubmitted', 'reminder_sent', 'renewed', 'expired', 'force_expired', 'cancelled', 'revived', 'refund_needed', 'token_issued', 'legacy'))
);
--> statement-breakpoint
CREATE INDEX `sponsorship_event_sponsorship_created_idx` ON `sponsorship_event` (`sponsorship_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `sponsorship_event_actor_id_idx` ON `sponsorship_event` (`actor_id`);--> statement-breakpoint
CREATE TABLE `sponsorship_token` (
	`id` text PRIMARY KEY NOT NULL,
	`sponsorship_id` text NOT NULL,
	`purpose` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`sponsorship_id`) REFERENCES `sponsorship`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "sponsorship_token_purpose_check" CHECK("purpose" IN ('reedit', 'renewal'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sponsorship_token_token_hash_unique` ON `sponsorship_token` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sponsorship_token_sponsorship_purpose_idx` ON `sponsorship_token` (`sponsorship_id`,`purpose`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`banned` integer DEFAULT false,
	`ban_reason` text,
	`ban_expires` integer,
	`locale` text,
	`legacy_id` text,
	CONSTRAINT "user_role_check" CHECK("role" IN ('user', 'admin')),
	CONSTRAINT "user_locale_check" CHECK("locale" IN ('nl', 'en', 'fr'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_legacy_id_unique` ON `user` (`legacy_id`);--> statement-breakpoint
CREATE INDEX `user_created_at_idx` ON `user` (`created_at`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);