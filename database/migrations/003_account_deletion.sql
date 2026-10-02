CREATE TABLE account_deletions (
 id TEXT PRIMARY KEY, target TEXT NOT NULL UNIQUE, actor TEXT NOT NULL,
 confirmed_email TEXT NOT NULL, actor_password_hash TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 1000), created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE deletion_blob_jobs (
 id TEXT PRIMARY KEY, prefix TEXT NOT NULL UNIQUE, not_before TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','FAILED')),
 attempts INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
);
--> statement-breakpoint
INSERT INTO users(id,email,name,role,active,password,created_at)
 VALUES ('__deleted_actor__','deleted-actor@invalid.local','Deleted account','SYSTEM',0,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
--> statement-breakpoint
CREATE TRIGGER protect_deleted_actor_update BEFORE UPDATE ON users WHEN OLD.id='__deleted_actor__' BEGIN SELECT RAISE(ABORT,'System attribution cannot be changed'); END;
--> statement-breakpoint
CREATE TRIGGER protect_deleted_actor_delete BEFORE DELETE ON users WHEN OLD.id='__deleted_actor__' BEGIN SELECT RAISE(ABORT,'System attribution cannot be changed'); END;
--> statement-breakpoint
CREATE TRIGGER keep_last_admin BEFORE UPDATE OF role,active ON users
 WHEN OLD.role='ADMIN' AND OLD.active=1 AND (NEW.role!='ADMIN' OR NEW.active!=1)
 AND NOT EXISTS(SELECT 1 FROM users WHERE role='ADMIN' AND active=1 AND id!=OLD.id)
 BEGIN SELECT RAISE(ABORT,'The last active administrator must remain'); END;
--> statement-breakpoint
CREATE TRIGGER authorize_account_deletion BEFORE INSERT ON account_deletions BEGIN
 SELECT CASE WHEN NEW.actor=NEW.target OR NEW.target='__deleted_actor__'
 OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.actor AND role='ADMIN' AND active=1 AND password=NEW.actor_password_hash)
 OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.target AND lower(email)=lower(NEW.confirmed_email) AND role IN ('STUDENT','FACULTY','ADMIN'))
 THEN RAISE(ABORT,'Account deletion authorization changed. Refresh and try again.') END;
 END;
--> statement-breakpoint
CREATE TRIGGER restrict_account_delete BEFORE DELETE ON users
 WHEN NOT EXISTS(SELECT 1 FROM account_deletions d JOIN users a ON a.id=d.actor
 WHERE d.target=OLD.id AND a.active=1 AND a.role='ADMIN' AND a.id!=OLD.id)
 BEGIN SELECT RAISE(ABORT,'A confirmed administrator deletion is required'); END;
--> statement-breakpoint
DROP TRIGGER attendance_original_no_delete;
--> statement-breakpoint
CREATE TRIGGER attendance_original_no_delete BEFORE DELETE ON attendance WHEN NOT EXISTS(SELECT 1 FROM account_deletions d WHERE OLD.user_id=d.target) BEGIN SELECT RAISE(ABORT,'History is immutable outside confirmed account deletion'); END;
--> statement-breakpoint
DROP TRIGGER ledger_no_delete;
--> statement-breakpoint
CREATE TRIGGER ledger_no_delete BEFORE DELETE ON hour_ledger WHEN NOT EXISTS(SELECT 1 FROM account_deletions d WHERE OLD.user_id=d.target) BEGIN SELECT RAISE(ABORT,'History is immutable outside confirmed account deletion'); END;
--> statement-breakpoint
DROP TRIGGER adjustments_no_delete;
--> statement-breakpoint
CREATE TRIGGER adjustments_no_delete BEFORE DELETE ON adjustments WHEN NOT EXISTS(SELECT 1 FROM account_deletions d WHERE EXISTS(SELECT 1 FROM attendance a WHERE a.id=OLD.attendance_id AND a.user_id=d.target)) BEGIN SELECT RAISE(ABORT,'History is immutable outside confirmed account deletion'); END;
--> statement-breakpoint
DROP TRIGGER audit_no_delete;
--> statement-breakpoint
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_logs WHEN NOT EXISTS(SELECT 1 FROM account_deletions d WHERE (OLD.entity='users' AND OLD.entity_id=d.target) OR (OLD.entity='attendance' AND OLD.entity_id IN (SELECT id FROM attendance WHERE user_id=d.target)) OR (OLD.entity='evidence' AND OLD.entity_id IN (SELECT e.id FROM evidence e JOIN attendance a ON a.id=e.attendance_id WHERE a.user_id=d.target))) BEGIN SELECT RAISE(ABORT,'History is immutable outside confirmed account deletion'); END;
--> statement-breakpoint
DROP TRIGGER ledger_no_update;
--> statement-breakpoint
CREATE TRIGGER ledger_no_update BEFORE UPDATE ON hour_ledger WHEN NOT (NEW.actor='__deleted_actor__' AND NEW.id IS OLD.id AND NEW.attendance_id IS OLD.attendance_id AND NEW.user_id IS OLD.user_id AND NEW.year IS OLD.year AND NEW.delta IS OLD.delta AND NEW.reason IS OLD.reason AND NEW.revision IS OLD.revision AND NEW.created_at IS OLD.created_at AND EXISTS(SELECT 1 FROM account_deletions WHERE target=OLD.actor)) BEGIN SELECT RAISE(ABORT,'History is immutable'); END;
--> statement-breakpoint
DROP TRIGGER adjustments_no_update;
--> statement-breakpoint
CREATE TRIGGER adjustments_no_update BEFORE UPDATE ON adjustments WHEN NOT (NEW.actor='__deleted_actor__' AND NEW.id IS OLD.id AND NEW.attendance_id IS OLD.attendance_id AND NEW.old_value IS OLD.old_value AND NEW.new_value IS OLD.new_value AND NEW.reason IS OLD.reason AND NEW.created_at IS OLD.created_at AND EXISTS(SELECT 1 FROM account_deletions WHERE target=OLD.actor)) BEGIN SELECT RAISE(ABORT,'History is immutable'); END;
--> statement-breakpoint
DROP TRIGGER audit_no_update;
--> statement-breakpoint
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_logs WHEN NOT (NEW.actor='__deleted_actor__' AND NEW.id IS OLD.id AND NEW.role IS OLD.role AND NEW.action IS OLD.action AND NEW.entity IS OLD.entity AND NEW.entity_id IS OLD.entity_id AND NEW.old_value IS OLD.old_value AND NEW.new_value IS OLD.new_value AND NEW.reason IS OLD.reason AND NEW.created_at IS OLD.created_at AND EXISTS(SELECT 1 FROM account_deletions WHERE target=OLD.actor)) BEGIN SELECT RAISE(ABORT,'History is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER purge_account AFTER INSERT ON account_deletions BEGIN
 -- One SQLite statement/transaction: any failure rolls back every database change.
 INSERT INTO deletion_blob_jobs(id,prefix,not_before,updated_at)
 VALUES(NEW.id,'evidence/'||NEW.target||'/',strftime('%Y-%m-%dT%H:%M:%fZ','now','+20 minutes'),NEW.created_at);
 DELETE FROM audit_logs WHERE (entity='users' AND entity_id=NEW.target)
 OR (entity='attendance' AND entity_id IN (SELECT id FROM attendance WHERE user_id=NEW.target))
 OR (entity='evidence' AND entity_id IN (SELECT e.id FROM evidence e JOIN attendance a ON a.id=e.attendance_id WHERE a.user_id=NEW.target));
 UPDATE audit_logs SET actor='__deleted_actor__' WHERE actor=NEW.target;
 UPDATE events SET coordinator=NEW.actor WHERE coordinator=NEW.target;
 DELETE FROM upload_intents WHERE user_id=NEW.target OR attendance_id IN (SELECT id FROM attendance WHERE user_id=NEW.target);
 DELETE FROM evidence WHERE attendance_id IN (SELECT id FROM attendance WHERE user_id=NEW.target);
 DELETE FROM corrections WHERE attendance_id IN (SELECT id FROM attendance WHERE user_id=NEW.target);
 DELETE FROM adjustments WHERE attendance_id IN (SELECT id FROM attendance WHERE user_id=NEW.target);
 DELETE FROM hour_ledger WHERE user_id=NEW.target;
 UPDATE adjustments SET actor='__deleted_actor__' WHERE actor=NEW.target;
 UPDATE hour_ledger SET actor='__deleted_actor__' WHERE actor=NEW.target;
 DELETE FROM attendance WHERE user_id=NEW.target;
 DELETE FROM notifications WHERE user_id=NEW.target;
 DELETE FROM resets WHERE user_id=NEW.target;
 DELETE FROM sessions WHERE user_id=NEW.target;
 DELETE FROM users WHERE id=NEW.target;
 INSERT INTO audit_logs(id,actor,role,action,entity,entity_id,old_value,new_value,reason,created_at)
 VALUES(NEW.id,NEW.actor,'ADMIN','Account permanently deleted','account_deletion',NEW.id,'null','{"databaseDeleted":true,"photoCleanup":"pending"}',NEW.reason,NEW.created_at);
 -- Do not retain target email/password hash in the request table.
 DELETE FROM account_deletions WHERE id=NEW.id;
 END;
--> statement-breakpoint
CREATE TRIGGER audit_actor_exists BEFORE INSERT ON audit_logs
WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.actor)
BEGIN SELECT RAISE(ABORT,'Account no longer exists. Sign in again.'); END;
