-- Existing records are retained. All new approval/credit operations use these gates.
CREATE TRIGGER preserve_original_location_in BEFORE UPDATE OF location_in ON attendance
 WHEN OLD.location_in IS NOT NULL AND NEW.location_in IS NOT OLD.location_in
 BEGIN SELECT RAISE(ABORT,'Original check-in GPS cannot be changed'); END;
--> statement-breakpoint
CREATE TRIGGER preserve_original_location_out BEFORE UPDATE OF location_out ON attendance
 WHEN OLD.location_out IS NOT NULL AND NEW.location_out IS NOT OLD.location_out
 BEGIN SELECT RAISE(ABORT,'Original check-out GPS cannot be changed'); END;
--> statement-breakpoint
CREATE TRIGGER verified_attendance_approval BEFORE UPDATE OF status ON attendance
 WHEN NEW.status IN ('APPROVED','PARTIAL') BEGIN
 SELECT CASE WHEN NEW.original_in IS NULL OR NEW.original_out IS NULL
 OR COALESCE(json_extract(NEW.location_in,'$.inside'),0)!=1
 OR COALESCE(json_extract(NEW.location_out,'$.inside'),0)!=1
 OR COALESCE(json_extract(NEW.location_in,'$.status'),'')!='Location verified'
 OR COALESCE(json_extract(NEW.location_out,'$.status'),'')!='Location verified'
 OR NOT EXISTS(SELECT 1 FROM evidence WHERE attendance_id=NEW.id AND status='APPROVED')
 THEN RAISE(ABORT,'Verified GPS and approved photo required before attendance approval') END;
 END;
--> statement-breakpoint
CREATE TRIGGER verified_hours_credit BEFORE INSERT ON hour_ledger
 WHEN NEW.delta>0 BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.actor AND role='ADMIN' AND active=1)
 OR NOT EXISTS(SELECT 1 FROM attendance a WHERE a.id=NEW.attendance_id AND a.status IN ('APPROVED','PARTIAL')
 AND a.original_in IS NOT NULL AND a.original_out IS NOT NULL
 AND COALESCE(json_extract(a.location_in,'$.inside'),0)=1 AND COALESCE(json_extract(a.location_out,'$.inside'),0)=1
 AND COALESCE(json_extract(a.location_in,'$.status'),'')='Location verified'
 AND COALESCE(json_extract(a.location_out,'$.status'),'')='Location verified'
 AND EXISTS(SELECT 1 FROM evidence WHERE attendance_id=a.id AND status='APPROVED'))
 THEN RAISE(ABORT,'Only an administrator may credit GPS-verified, photo-approved attendance') END;
 END;
--> statement-breakpoint
CREATE TRIGGER protect_credited_evidence BEFORE UPDATE OF status ON evidence
 WHEN OLD.status='APPROVED' AND NEW.status!='APPROVED'
 AND EXISTS(SELECT 1 FROM attendance WHERE id=OLD.attendance_id AND status IN ('APPROVED','PARTIAL'))
 BEGIN SELECT RAISE(ABORT,'Reopen attendance and reverse hours before changing approved evidence'); END;
