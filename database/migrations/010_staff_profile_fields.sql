-- The original users schema has NOT NULL year/batch/roll columns.
-- Staff use year=0 (not applicable), empty batch/roll and no NSS ID.
-- Participant years remain 1 or 2; no attendance or hours records are changed.
INSERT INTO audit_logs (id,actor,role,action,entity,entity_id,old_value,new_value,reason,created_at)
SELECT lower(hex(randomblob(16))),'__deleted_actor__','SYSTEM','Staff profile fields cleared','users',id,
 json_object('batch',batch,'year',year,'roll',roll,'nss_id',nss_id),
 json_object('batch','','year',NULL,'roll','','nss_id',NULL),
 'Role-specific profile update: student enrollment fields do not apply to faculty or administrators.',
 strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM users WHERE role IN ('ADMIN','FACULTY') AND (batch<>'' OR year<>0 OR roll<>'' OR nss_id IS NOT NULL);
--> statement-breakpoint
UPDATE users SET batch='',year=0,roll='',nss_id=NULL WHERE role IN ('ADMIN','FACULTY');
--> statement-breakpoint
CREATE TRIGGER staff_profile_insert AFTER INSERT ON users
WHEN NEW.role IN ('ADMIN','FACULTY') AND (NEW.batch<>'' OR NEW.year<>0 OR NEW.roll<>'' OR NEW.nss_id IS NOT NULL)
BEGIN UPDATE users SET batch='',year=0,roll='',nss_id=NULL WHERE id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER staff_profile_update AFTER UPDATE OF role,batch,year,roll,nss_id ON users
WHEN NEW.role IN ('ADMIN','FACULTY') AND (NEW.batch<>'' OR NEW.year<>0 OR NEW.roll<>'' OR NEW.nss_id IS NOT NULL)
BEGIN UPDATE users SET batch='',year=0,roll='',nss_id=NULL WHERE id=NEW.id; END;
