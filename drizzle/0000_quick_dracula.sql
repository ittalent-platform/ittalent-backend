CREATE TABLE `broadcast_notifications` (
	`id` text(24) PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`data` text,
	`scheduled_for` integer,
	`sent_at` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_by` text(24) NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `broadcast_status_idx` ON `broadcast_notifications` (`status`);--> statement-breakpoint
CREATE TABLE `certificate_links` (
	`id` text(24) PRIMARY KEY NOT NULL,
	`user_id` text(24) NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`issuer` text,
	`issued_date` text,
	`expiry_date` text,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cert_links_user_idx` ON `certificate_links` (`user_id`);--> statement-breakpoint
CREATE TABLE `device_tokens` (
	`id` text(24) PRIMARY KEY NOT NULL,
	`user_id` text(24) NOT NULL,
	`token` text NOT NULL,
	`platform` text NOT NULL,
	`last_seen_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `device_tokens_user_idx` ON `device_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text(24) PRIMARY KEY NOT NULL,
	`user_id` text(24) NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`data` text,
	`is_read` integer DEFAULT false NOT NULL,
	`read_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `portfolio_links` (
	`id` text(24) PRIMARY KEY NOT NULL,
	`user_id` text(24) NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`description` text,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `portfolio_links_user_idx` ON `portfolio_links` (`user_id`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text(24) PRIMARY KEY NOT NULL,
	`reporter_id` text(24) NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text(24) NOT NULL,
	`reason` text NOT NULL,
	`description` text NOT NULL,
	`evidence_files` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`resolution_notes` text,
	`resolved_by` text(24),
	`resolved_at` integer,
	`status_history` text DEFAULT '[]' NOT NULL,
	`target_snapshot` text,
	`timeline` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reports_target_idx` ON `reports` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `reports_status_idx` ON `reports` (`status`);--> statement-breakpoint
CREATE TABLE `applications` (
	`id` text(24) PRIMARY KEY NOT NULL,
	`job_id` text(24) NOT NULL,
	`applicant_id` text(24) NOT NULL,
	`cv_id` text(24) NOT NULL,
	`cover_letter_id` text(24),
	`message` text,
	`status` text DEFAULT 'submitted' NOT NULL,
	`withdrawal_reason` text,
	`reapplied_from` text(24),
	`reapplied_as` text(24),
	`status_history` text DEFAULT '[]' NOT NULL,
	`certificates` text DEFAULT '[]' NOT NULL,
	`notes` text DEFAULT '[]' NOT NULL,
	`idempotency_key` text,
	`request_hash` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `applications_job_applicant_idx` ON `applications` (`job_id`,`applicant_id`);--> statement-breakpoint
CREATE INDEX `applications_status_idx` ON `applications` (`status`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text(24) PRIMARY KEY NOT NULL,
	`owner_id` text(24) NOT NULL,
	`type` text NOT NULL,
	`file_url` text NOT NULL,
	`storage_key` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `documents_owner_type_idx` ON `documents` (`owner_id`,`type`);--> statement-breakpoint
CREATE TABLE `interviews` (
	`id` text(24) PRIMARY KEY NOT NULL,
	`enterprise_id` text(24) NOT NULL,
	`application_id` text(24) NOT NULL,
	`job_id` text(24) NOT NULL,
	`applicant_id` text(24) NOT NULL,
	`interviewer_ids` text DEFAULT '[]' NOT NULL,
	`created_by` text(24) NOT NULL,
	`scheduled_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`duration_minutes` integer NOT NULL,
	`mode` text NOT NULL,
	`meeting_link` text,
	`location` text,
	`notes` text,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`reschedule_request` text,
	`status_history` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `interviews_app_idx` ON `interviews` (`application_id`);--> statement-breakpoint
CREATE INDEX `interviews_enterprise_idx` ON `interviews` (`enterprise_id`);--> statement-breakpoint
CREATE INDEX `interviews_applicant_idx` ON `interviews` (`applicant_id`);--> statement-breakpoint
CREATE INDEX `interviews_status_idx` ON `interviews` (`status`);--> statement-breakpoint
CREATE INDEX `interviews_scheduled_idx` ON `interviews` (`scheduled_at`,`ends_at`);--> statement-breakpoint
CREATE TABLE `wishlists` (
	`id` text(24) PRIMARY KEY NOT NULL,
	`user_id` text(24) NOT NULL,
	`job_id` text(24) NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wishlists_user_job_idx` ON `wishlists` (`user_id`,`job_id`);--> statement-breakpoint
CREATE TABLE `enterprise_registrations` (
	`id` text(24) PRIMARY KEY NOT NULL,
	`user_id` text(24),
	`company_name` text NOT NULL,
	`tax_code` text NOT NULL,
	`representative_name` text NOT NULL,
	`representative_email` text NOT NULL,
	`representative_phone` text NOT NULL,
	`company_email` text NOT NULL,
	`company_phone` text NOT NULL,
	`website` text,
	`industry` text NOT NULL,
	`company_size` text NOT NULL,
	`address` text NOT NULL,
	`business_license_url` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`rejection_reason` text,
	`reviewed_by` text(24),
	`reviewed_at` integer,
	`created_enterprise_id` text(24),
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ent_reg_status_idx` ON `enterprise_registrations` (`status`);--> statement-breakpoint
CREATE INDEX `ent_reg_email_idx` ON `enterprise_registrations` (`representative_email`);--> statement-breakpoint
CREATE TABLE `enterprises` (
	`id` text(24) PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`legal_name` text,
	`tax_code` text NOT NULL,
	`registration_number` text,
	`founded_year` integer,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`website` text,
	`industry` text NOT NULL,
	`sub_industries` text,
	`company_size` text NOT NULL,
	`company_type` text,
	`address` text NOT NULL,
	`branches` text,
	`logo_url` text,
	`cover_url` text,
	`short_description` text,
	`description` text,
	`culture_summary` text,
	`benefits` text,
	`tech_stack` text,
	`social_links` text,
	`working_days` text,
	`media_gallery` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`status_reason` text,
	`status_updated_by` text(24),
	`status_updated_at` integer,
	`creator_account_id` text(24) NOT NULL,
	`admin_mutation_version` integer DEFAULT 0 NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL,
	`deleted_at` integer,
	`deleted_by` text(24),
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `enterprises_name_idx` ON `enterprises` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `enterprises_tax_code_idx` ON `enterprises` (`tax_code`);--> statement-breakpoint
CREATE INDEX `enterprises_status_idx` ON `enterprises` (`status`);--> statement-breakpoint
CREATE INDEX `enterprises_creator_idx` ON `enterprises` (`creator_account_id`);--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` text(24) PRIMARY KEY NOT NULL,
	`user_id` text(24) NOT NULL,
	`provider` text NOT NULL,
	`provider_account_id` text,
	`password_hash` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `accounts_user_id_idx` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX `accounts_provider_idx` ON `accounts` (`provider`,`provider_account_id`);--> statement-breakpoint
CREATE TABLE `tokens` (
	`id` text(24) PRIMARY KEY NOT NULL,
	`user_id` text(24) NOT NULL,
	`type` text NOT NULL,
	`token_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tokens_user_id_idx` ON `tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `tokens_hash_type_idx` ON `tokens` (`token_hash`,`type`);--> statement-breakpoint
CREATE TABLE `user_audits` (
	`id` text(24) PRIMARY KEY NOT NULL,
	`target_user_id` text(24) NOT NULL,
	`actor_user_id` text(24) NOT NULL,
	`action` text NOT NULL,
	`result` text DEFAULT 'success' NOT NULL,
	`reason` text,
	`changes` text,
	`version` integer NOT NULL,
	`occurred_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `user_audits_target_idx` ON `user_audits` (`target_user_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `user_email_changes` (
	`id` text(24) PRIMARY KEY NOT NULL,
	`target_user_id` text(24) NOT NULL,
	`requested_by` text(24) NOT NULL,
	`current_email` text NOT NULL,
	`new_email` text NOT NULL,
	`token_hash` text NOT NULL,
	`expected_version` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `user_email_changes_target_idx` ON `user_email_changes` (`target_user_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_changes_token_idx` ON `user_email_changes` (`token_hash`);--> statement-breakpoint
CREATE TABLE `user_invitations` (
	`id` text(24) PRIMARY KEY NOT NULL,
	`target_user_id` text(24) NOT NULL,
	`invited_by` text(24) NOT NULL,
	`kind` text NOT NULL,
	`role` text NOT NULL,
	`enterprise_id` text(24),
	`token_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`revoked_at` integer,
	`delivery_status` text DEFAULT 'pending' NOT NULL,
	`delivery_attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `user_invitations_target_idx` ON `user_invitations` (`target_user_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_invitations_token_idx` ON `user_invitations` (`token_hash`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text(24) PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`username` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`full_name` text,
	`phone` text,
	`avatar_url` text,
	`avatar_storage_key` text,
	`email_verified` integer DEFAULT false NOT NULL,
	`auth_version` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`admin_lock_version` integer DEFAULT 0 NOT NULL,
	`identity_request_version` integer DEFAULT 0 NOT NULL,
	`verification_started_at` integer,
	`enterprise_id` text(24),
	`status_updated_at` integer,
	`status_updated_by` text(24),
	`status_reason` text,
	`status_history` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_idx` ON `users` (`username`);--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`);--> statement-breakpoint
CREATE INDEX `users_status_idx` ON `users` (`status`);--> statement-breakpoint
CREATE INDEX `users_enterprise_id_idx` ON `users` (`enterprise_id`);--> statement-breakpoint
CREATE TABLE `job_posting_audits` (
	`id` text(24) PRIMARY KEY NOT NULL,
	`job_posting_id` text(24) NOT NULL,
	`actor_user_id` text(24) NOT NULL,
	`action` text NOT NULL,
	`changes` text,
	`occurred_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `job_audits_posting_idx` ON `job_posting_audits` (`job_posting_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `job_postings` (
	`id` text(24) PRIMARY KEY NOT NULL,
	`enterprise_id` text(24) NOT NULL,
	`posted_by_user_id` text(24) NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`location` text,
	`employment_type` text,
	`salary_min` integer,
	`salary_max` integer,
	`salary_negotiable` integer DEFAULT false NOT NULL,
	`currency` text DEFAULT 'VND' NOT NULL,
	`level` text,
	`description` text,
	`requirements` text,
	`benefits` text,
	`openings` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`closed_at` integer,
	`archived_at` integer,
	`expires_at` integer,
	`deleting` integer DEFAULT false,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_postings_slug_idx` ON `job_postings` (`slug`);--> statement-breakpoint
CREATE INDEX `job_postings_enterprise_idx` ON `job_postings` (`enterprise_id`);--> statement-breakpoint
CREATE INDEX `job_postings_status_idx` ON `job_postings` (`status`);