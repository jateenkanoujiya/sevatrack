ALTER TABLE users ADD COLUMN owner_proxy INTEGER NOT NULL DEFAULT 0 CHECK(owner_proxy IN (0,1));
--> statement-breakpoint
DROP TRIGGER keep_last_admin;
--> statement-breakpoint
CREATE TRIGGER keep_last_admin BEFORE UPDATE OF role,active ON users
 WHEN OLD.role IN ('SUPER_ADMIN','ADMIN') AND OLD.active=1 AND (NEW.role NOT IN ('SUPER_ADMIN','ADMIN') OR NEW.active!=1)
 AND NOT EXISTS(SELECT 1 FROM users WHERE role IN ('SUPER_ADMIN','ADMIN') AND active=1 AND id!=OLD.id)
 BEGIN SELECT RAISE(ABORT,'The last active administrator must remain'); END;
--> statement-breakpoint
DROP TRIGGER restrict_account_delete;
--> statement-breakpoint
CREATE TRIGGER restrict_account_delete BEFORE DELETE ON users
 WHEN NOT EXISTS(SELECT 1 FROM account_deletions d JOIN users a ON a.id=d.actor
 WHERE d.target=OLD.id AND a.active=1 AND a.role IN ('SUPER_ADMIN','ADMIN') AND a.id!=OLD.id)
 BEGIN SELECT RAISE(ABORT,'A confirmed administrator deletion is required'); END;
--> statement-breakpoint
DROP TRIGGER purge_account;
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
 VALUES(NEW.id,NEW.actor,(SELECT CASE WHEN owner_proxy=1 THEN 'OWNER' ELSE role END FROM users WHERE id=NEW.actor),'Account permanently deleted','account_deletion',NEW.id,'null','{"databaseDeleted":true,"photoCleanup":"pending"}',NEW.reason,NEW.created_at);
 -- Do not retain target email/password hash in the request table.
 DELETE FROM account_deletions WHERE id=NEW.id;
 END;
--> statement-breakpoint
DROP TRIGGER verified_hours_credit;
--> statement-breakpoint
CREATE TRIGGER verified_hours_credit BEFORE INSERT ON hour_ledger
 WHEN NEW.delta>0 BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.actor AND role IN ('SUPER_ADMIN','ADMIN') AND active=1)
 OR NOT EXISTS(SELECT 1 FROM attendance a WHERE a.id=NEW.attendance_id AND a.status IN ('APPROVED','PARTIAL')
 AND a.original_in IS NOT NULL AND a.original_out IS NOT NULL
 AND COALESCE(json_extract(a.location_in,'$.inside'),0)=1 AND COALESCE(json_extract(a.location_out,'$.inside'),0)=1
 AND COALESCE(json_extract(a.location_in,'$.status'),'')='Location verified'
 AND COALESCE(json_extract(a.location_out,'$.status'),'')='Location verified'
 AND EXISTS(SELECT 1 FROM evidence WHERE attendance_id=a.id AND status='APPROVED'))
 THEN RAISE(ABORT,'Only an administrator may credit GPS-verified, photo-approved attendance') END;
 END;
--> statement-breakpoint
DROP TRIGGER authorize_account_deletion;
--> statement-breakpoint
CREATE TRIGGER authorize_account_deletion BEFORE INSERT ON account_deletions BEGIN
 SELECT CASE WHEN NEW.actor=NEW.target OR NEW.target='__deleted_actor__'
 OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.actor AND role IN ('SUPER_ADMIN','ADMIN') AND active=1 AND password=NEW.actor_password_hash)
 OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.target AND lower(email)=lower(NEW.confirmed_email) AND role IN ('STUDENT','VOLUNTEER','FACULTY','SUPER_ADMIN','ADMIN'))
 THEN RAISE(ABORT,'Account deletion authorization changed. Refresh and try again.') END;
 END;
--> statement-breakpoint
DROP TRIGGER historical_authorize;
--> statement-breakpoint
CREATE TRIGGER historical_authorize BEFORE INSERT ON historical_hours BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND role IN ('STUDENT','VOLUNTEER'))
 OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.actor AND active=1 AND
 (role IN ('SUPER_ADMIN','ADMIN') OR (role='FACULTY' AND strftime('%Y-%m-%dT%H:%M:%fZ','now')<'2026-10-07T18:30:00.000Z')))
 THEN RAISE(ABORT,'Historical entry is restricted or the faculty deadline has passed') END;
 SELECT CASE WHEN NEW.revision!=COALESCE((SELECT MAX(revision) FROM historical_hours WHERE user_id=NEW.user_id AND year=NEW.year),0)+1
 OR abs(NEW.balance-ROUND(COALESCE((SELECT SUM(delta) FROM historical_hours WHERE user_id=NEW.user_id AND year=NEW.year),0)+NEW.delta,2))>0.000001
 THEN RAISE(ABORT,'Historical balance changed; refresh before saving') END;
END;
--> statement-breakpoint
DROP TRIGGER past_hours_authorize;
--> statement-breakpoint
CREATE TRIGGER past_hours_authorize BEFORE INSERT ON past_event_hours BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.actor AND active=1 AND role IN ('SUPER_ADMIN','ADMIN'))
 OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND role IN ('STUDENT','VOLUNTEER'))
 OR NOT EXISTS(SELECT 1 FROM past_events WHERE id=NEW.event_id AND end<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND hours>=NEW.balance)
 THEN RAISE(ABORT,'Only an administrator may credit documented past service within event hours') END;
 SELECT CASE WHEN NEW.revision!=COALESCE((SELECT MAX(revision) FROM past_event_hours WHERE event_id=NEW.event_id AND user_id=NEW.user_id),0)+1
 OR abs(NEW.balance-ROUND(COALESCE((SELECT SUM(delta) FROM past_event_hours WHERE event_id=NEW.event_id AND user_id=NEW.user_id),0)+NEW.delta,2))>0.000001
 OR EXISTS(SELECT 1 FROM past_event_hours WHERE event_id=NEW.event_id AND user_id=NEW.user_id AND year!=NEW.year)
 THEN RAISE(ABORT,'Past service changed or NSS year differs; refresh before saving') END;
END;
--> statement-breakpoint
DROP TRIGGER staff_profile_insert;
--> statement-breakpoint
CREATE TRIGGER staff_profile_insert AFTER INSERT ON users
WHEN NEW.role IN ('SUPER_ADMIN','ADMIN','FACULTY') AND (NEW.batch<>'' OR NEW.year<>0 OR NEW.roll<>'' OR NEW.nss_id IS NOT NULL)
BEGIN UPDATE users SET batch='',year=0,roll='',nss_id=NULL WHERE id=NEW.id; END;
--> statement-breakpoint
DROP TRIGGER staff_profile_update;
--> statement-breakpoint
CREATE TRIGGER staff_profile_update AFTER UPDATE OF role,batch,year,roll,nss_id ON users
WHEN NEW.role IN ('SUPER_ADMIN','ADMIN','FACULTY') AND (NEW.batch<>'' OR NEW.year<>0 OR NEW.roll<>'' OR NEW.nss_id IS NOT NULL)
BEGIN UPDATE users SET batch='',year=0,roll='',nss_id=NULL WHERE id=NEW.id; END;
--> statement-breakpoint
UPDATE users SET role='SUPER_ADMIN' WHERE id=(
 SELECT id FROM users WHERE role='ADMIN' AND active=1
 ORDER BY CASE WHEN id LIKE 'institute-admin-%' THEN 0 ELSE 1 END,created_at,id LIMIT 1
);
--> statement-breakpoint
INSERT INTO audit_logs(id,actor,role,action,entity,entity_id,old_value,new_value,reason,created_at)
 SELECT lower(hex(randomblob(16))),id,'SUPER_ADMIN','Institute Super Admin assigned','users',id,
 '{"role":"ADMIN"}','{"role":"SUPER_ADMIN"}','Initial institute leadership migration',strftime('%Y-%m-%dT%H:%M:%fZ','now')
 FROM users WHERE role='SUPER_ADMIN';
--> statement-breakpoint
CREATE TRIGGER keep_last_super_admin_update BEFORE UPDATE OF role,active ON users
 WHEN OLD.role='SUPER_ADMIN' AND OLD.active=1 AND OLD.owner_proxy=0 AND (NEW.role!='SUPER_ADMIN' OR NEW.active!=1)
 AND NOT EXISTS(SELECT 1 FROM users WHERE role='SUPER_ADMIN' AND active=1 AND owner_proxy=0 AND id!=OLD.id)
 BEGIN SELECT RAISE(ABORT,'The last active institute Super Admin must remain'); END;
--> statement-breakpoint
CREATE TRIGGER keep_last_super_admin_delete BEFORE DELETE ON users
 WHEN OLD.role='SUPER_ADMIN' AND OLD.active=1 AND OLD.owner_proxy=0
 AND NOT EXISTS(SELECT 1 FROM users WHERE role='SUPER_ADMIN' AND active=1 AND owner_proxy=0 AND id!=OLD.id)
 BEGIN SELECT RAISE(ABORT,'The last active institute Super Admin must remain'); END;
--> statement-breakpoint
CREATE TRIGGER protect_leadership_deletion BEFORE INSERT ON account_deletions
 WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.target AND
 (owner_proxy=1 OR (role='SUPER_ADMIN' AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.actor AND role='SUPER_ADMIN'))
 OR (role='ADMIN' AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.actor AND role='SUPER_ADMIN'))))
 BEGIN SELECT RAISE(ABORT,'This account is protected by institute role permissions'); END;
