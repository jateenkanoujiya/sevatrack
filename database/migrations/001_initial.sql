CREATE TABLE `adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`attendance_id` text NOT NULL,
	`actor` text NOT NULL,
	`old_value` text NOT NULL,
	`new_value` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`attendance_id`) REFERENCES `attendance`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`year` integer NOT NULL,
	`status` text NOT NULL,
	`original_in` text,
	`original_out` text,
	`effective_in` text,
	`effective_out` text,
	`location_in` text,
	`location_out` text,
	`remarks` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_unique` ON `attendance` (`event_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `attendance_user` ON `attendance` (`user_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`role` text NOT NULL,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`old_value` text NOT NULL,
	`new_value` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_entity` ON `audit_logs` (`entity`,`entity_id`);--> statement-breakpoint
CREATE TABLE `catalogs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`details` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_unique` ON `catalogs` (`kind`,`name`);--> statement-breakpoint
CREATE TABLE `corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`attendance_id` text NOT NULL,
	`issue` text NOT NULL,
	`explanation` text NOT NULL,
	`status` text NOT NULL,
	`response` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`attendance_id`) REFERENCES `attendance`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `correction_attendance` ON `corrections` (`attendance_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`deadline` text NOT NULL,
	`hours` real NOT NULL,
	`location` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`radius` integer NOT NULL,
	`capacity` integer NOT NULL,
	`coordinator` text NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`proof` integer DEFAULT 1 NOT NULL,
	`status` text NOT NULL,
	`banner` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`coordinator`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `event_coordinator` ON `events` (`coordinator`);--> statement-breakpoint
CREATE INDEX `event_start` ON `events` (`start`);--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`attendance_id` text NOT NULL,
	`key` text NOT NULL,
	`mime` text NOT NULL,
	`location` text NOT NULL,
	`captured_at` text,
	`status` text NOT NULL,
	`remarks` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`attendance_id`) REFERENCES `attendance`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `evidence_attendance` ON `evidence` (`attendance_id`);--> statement-breakpoint
CREATE TABLE `hour_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`attendance_id` text NOT NULL,
	`user_id` text NOT NULL,
	`year` integer NOT NULL,
	`delta` real NOT NULL,
	`reason` text NOT NULL,
	`actor` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`attendance_id`) REFERENCES `attendance`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_revision` ON `hour_ledger` (`attendance_id`,`revision`);--> statement-breakpoint
CREATE INDEX `ledger_user_year` ON `hour_ledger` (`user_id`,`year`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`read` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notifications_user` ON `notifications` (`user_id`);--> statement-breakpoint
CREATE TABLE `resets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text,
	`expires` text,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `session_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`department` text DEFAULT 'NSS Unit' NOT NULL,
	`batch` text DEFAULT '2026–2028' NOT NULL,
	`nss_id` text,
	`roll` text DEFAULT '' NOT NULL,
	`year` integer DEFAULT 1 NOT NULL,
	`password` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_nss_id_unique` ON `users` (`nss_id`);--> statement-breakpoint
CREATE UNIQUE INDEX correction_one_pending ON corrections(attendance_id) WHERE status='PENDING';
--> statement-breakpoint
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT,'Audit records are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT,'Audit records are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER ledger_no_update BEFORE UPDATE ON hour_ledger BEGIN SELECT RAISE(ABORT,'Ledger entries are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER ledger_no_delete BEFORE DELETE ON hour_ledger BEGIN SELECT RAISE(ABORT,'Ledger entries are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER attendance_revision BEFORE UPDATE ON attendance WHEN NEW.revision<0 BEGIN SELECT RAISE(ABORT,'Concurrent attendance change. Refresh and try again.'); END;
--> statement-breakpoint
CREATE TRIGGER preserve_original_in BEFORE UPDATE OF original_in ON attendance WHEN OLD.original_in IS NOT NULL AND NEW.original_in IS NOT OLD.original_in BEGIN SELECT RAISE(ABORT,'Original check-in cannot be modified'); END;
--> statement-breakpoint
CREATE TRIGGER preserve_original_out BEFORE UPDATE OF original_out ON attendance WHEN OLD.original_out IS NOT NULL AND NEW.original_out IS NOT OLD.original_out BEGIN SELECT RAISE(ABORT,'Original check-out cannot be modified'); END;
--> statement-breakpoint
CREATE TRIGGER hours_cancelled BEFORE INSERT ON hour_ledger WHEN NEW.delta>0 AND (SELECT e.status FROM events e JOIN attendance a ON a.event_id=e.id WHERE a.id=NEW.attendance_id)='Cancelled' BEGIN SELECT RAISE(ABORT,'Cancelled event cannot earn hours'); END;
--> statement-breakpoint
CREATE TRIGGER registration_capacity_insert BEFORE INSERT ON attendance WHEN NEW.status='REGISTERED' AND (SELECT COUNT(*) FROM attendance WHERE event_id=NEW.event_id AND status!='CANCELLED') >= (SELECT capacity FROM events WHERE id=NEW.event_id) BEGIN SELECT RAISE(ABORT,'This event is full'); END;
--> statement-breakpoint
CREATE TRIGGER registration_capacity_update BEFORE UPDATE OF status ON attendance WHEN OLD.status='CANCELLED' AND NEW.status='REGISTERED' AND (SELECT COUNT(*) FROM attendance WHERE event_id=NEW.event_id AND status!='CANCELLED') >= (SELECT capacity FROM events WHERE id=NEW.event_id) BEGIN SELECT RAISE(ABORT,'This event is full'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_single_use BEFORE UPDATE ON resets WHEN OLD.status='USED' AND NEW.status='USED' BEGIN SELECT RAISE(ABORT,'Recovery link already used'); END;

--> statement-breakpoint
CREATE TRIGGER ledger_identity BEFORE INSERT ON hour_ledger WHEN NOT EXISTS(SELECT 1 FROM attendance a WHERE a.id=NEW.attendance_id AND a.user_id=NEW.user_id AND a.year=NEW.year AND a.revision=NEW.revision) BEGIN SELECT RAISE(ABORT,'Ledger identity or revision mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER ledger_nonnegative BEFORE INSERT ON hour_ledger WHEN ROUND(COALESCE((SELECT SUM(delta) FROM hour_ledger WHERE attendance_id=NEW.attendance_id),0)+NEW.delta,2)<0 OR ROUND(COALESCE((SELECT SUM(delta) FROM hour_ledger WHERE attendance_id=NEW.attendance_id),0)+NEW.delta,2)>24 BEGIN SELECT RAISE(ABORT,'Invalid attendance hours balance'); END;
--> statement-breakpoint
CREATE TRIGGER attendance_original_no_delete BEFORE DELETE ON attendance BEGIN SELECT RAISE(ABORT,'Attendance history cannot be deleted'); END;
--> statement-breakpoint
CREATE TRIGGER adjustments_no_delete BEFORE DELETE ON adjustments BEGIN SELECT RAISE(ABORT,'Adjustment history cannot be deleted'); END;
--> statement-breakpoint
CREATE TRIGGER adjustments_no_update BEFORE UPDATE ON adjustments BEGIN SELECT RAISE(ABORT,'Adjustment history cannot be changed'); END;
--> statement-breakpoint
CREATE TRIGGER attendance_valid_year BEFORE INSERT ON attendance WHEN NEW.year NOT IN (1,2) BEGIN SELECT RAISE(ABORT,'Invalid NSS year'); END;
--> statement-breakpoint
CREATE TRIGGER preserve_attendance_identity BEFORE UPDATE OF user_id,event_id,year ON attendance WHEN OLD.user_id IS NOT NEW.user_id OR OLD.event_id IS NOT NEW.event_id OR OLD.year IS NOT NEW.year BEGIN SELECT RAISE(ABORT,'Attendance identity cannot be modified'); END;
--> statement-breakpoint
CREATE INDEX idx_attendance_event_status ON attendance(event_id,status);
--> statement-breakpoint
CREATE INDEX idx_users_role_department ON users(role,department);
--> statement-breakpoint
CREATE INDEX idx_ledger_date ON hour_ledger(created_at);
--> statement-breakpoint
CREATE INDEX idx_evidence_status ON evidence(status,attendance_id);
--> statement-breakpoint
CREATE INDEX idx_reset_requests ON resets(status,user_id);
