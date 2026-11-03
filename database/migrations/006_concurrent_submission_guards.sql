-- Prevent a second concurrent reset from changing the password again.
-- The password update and this transition are already in one write transaction.
CREATE TRIGGER consume_reset_once BEFORE UPDATE OF status ON resets
 WHEN NEW.status='USED' AND (OLD.status!='ISSUED' OR OLD.expires<=strftime('%Y-%m-%dT%H:%M:%fZ','now'))
 BEGIN SELECT RAISE(ABORT,'Reset link already consumed or expired'); END;
--> statement-breakpoint
-- An upload may finish after a reviewer has finalized the attendance.
-- Recheck eligibility at INSERT time, inside the same transaction as the evidence.
CREATE TRIGGER protect_finalized_photo_insert BEFORE INSERT ON evidence
 WHEN NOT EXISTS(SELECT 1 FROM attendance a JOIN events e ON e.id=a.event_id
 WHERE a.id=NEW.attendance_id AND a.status IN ('CHECKED_IN','CHECKED_OUT','EVIDENCE_PENDING','PENDING_REVIEW')
 AND a.original_in IS NOT NULL AND e.status!='Cancelled')
 BEGIN SELECT RAISE(ABORT,'Attendance no longer accepts evidence'); END;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sessions_by_expiry ON sessions(expires);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS rate_limits_by_expiry ON rate_limits(expires);
