CREATE TABLE upload_intents (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id),
 attendance_id TEXT NOT NULL REFERENCES attendance(id),
 path TEXT UNIQUE NOT NULL,
 mime TEXT NOT NULL,
 size INTEGER NOT NULL CHECK(size>0 AND size<=5242880),
 location TEXT NOT NULL,
 expires TEXT NOT NULL,
 created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX upload_intents_owner ON upload_intents(user_id,expires);
--> statement-breakpoint
CREATE TRIGGER evidence_capacity BEFORE INSERT ON evidence WHEN (SELECT COUNT(*) FROM evidence WHERE attendance_id=NEW.attendance_id)>=10 BEGIN SELECT RAISE(ABORT,'Photo limit reached'); END;
--> statement-breakpoint
CREATE TRIGGER evidence_active_attendance BEFORE INSERT ON evidence WHEN NOT EXISTS(SELECT 1 FROM attendance a JOIN events e ON e.id=a.event_id WHERE a.id=NEW.attendance_id AND a.status NOT IN ('REGISTERED','CANCELLED','REJECTED','ABSENT') AND e.status!='Cancelled') BEGIN SELECT RAISE(ABORT,'Attendance no longer accepts proof'); END;
