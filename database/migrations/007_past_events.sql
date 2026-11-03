-- Archived service is explicitly attested by an administrator. Live GPS rules remain unchanged.
CREATE TABLE past_events (
 id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL,
 start TEXT NOT NULL, end TEXT NOT NULL, location TEXT NOT NULL, hours REAL NOT NULL CHECK(hours>0 AND hours<=24),
 source TEXT NOT NULL CHECK(length(trim(source)) BETWEEN 1 AND 500), coordinator TEXT NOT NULL REFERENCES users(id),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0), created_at TEXT NOT NULL,
 CHECK(julianday(end)>julianday(start) AND julianday(end)-julianday(start)<=1.000001)
);
--> statement-breakpoint
CREATE UNIQUE INDEX past_event_duplicate ON past_events(lower(trim(title)),start,lower(trim(location)));
--> statement-breakpoint
CREATE TABLE past_event_hours (
 id TEXT PRIMARY KEY NOT NULL, event_id TEXT NOT NULL REFERENCES past_events(id), user_id TEXT NOT NULL REFERENCES users(id),
 year INTEGER NOT NULL CHECK(year IN (1,2)), delta REAL NOT NULL, balance REAL NOT NULL CHECK(balance BETWEEN 0 AND 24),
 revision INTEGER NOT NULL CHECK(revision>0), source TEXT NOT NULL CHECK(length(trim(source)) BETWEEN 1 AND 500),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 1000), actor TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 UNIQUE(event_id,user_id,revision), CHECK(abs(delta*100-round(delta*100))<0.000001)
);
--> statement-breakpoint
CREATE INDEX past_hours_user ON past_event_hours(user_id,year);
--> statement-breakpoint
CREATE TRIGGER past_hours_authorize BEFORE INSERT ON past_event_hours BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.actor AND active=1 AND role='ADMIN')
 OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND role='STUDENT')
 OR NOT EXISTS(SELECT 1 FROM past_events WHERE id=NEW.event_id AND end<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND hours>=NEW.balance)
 THEN RAISE(ABORT,'Only an administrator may credit documented past service within event hours') END;
 SELECT CASE WHEN NEW.revision!=COALESCE((SELECT MAX(revision) FROM past_event_hours WHERE event_id=NEW.event_id AND user_id=NEW.user_id),0)+1
 OR abs(NEW.balance-ROUND(COALESCE((SELECT SUM(delta) FROM past_event_hours WHERE event_id=NEW.event_id AND user_id=NEW.user_id),0)+NEW.delta,2))>0.000001
 OR EXISTS(SELECT 1 FROM past_event_hours WHERE event_id=NEW.event_id AND user_id=NEW.user_id AND year!=NEW.year)
 THEN RAISE(ABORT,'Past service changed or NSS year differs; refresh before saving') END;
END;
--> statement-breakpoint
CREATE TRIGGER past_event_valid_insert BEFORE INSERT ON past_events WHEN NEW.end>strftime('%Y-%m-%dT%H:%M:%fZ','now')
 BEGIN SELECT RAISE(ABORT,'Past events must have already ended'); END;
--> statement-breakpoint
CREATE TRIGGER past_event_valid_update BEFORE UPDATE ON past_events BEGIN
 SELECT CASE WHEN NEW.end>strftime('%Y-%m-%dT%H:%M:%fZ','now') OR NEW.revision<OLD.revision
 OR EXISTS(SELECT 1 FROM past_event_hours h WHERE h.event_id=OLD.id AND h.revision=(SELECT MAX(x.revision) FROM past_event_hours x WHERE x.event_id=h.event_id AND x.user_id=h.user_id) AND h.balance>NEW.hours)
 THEN RAISE(ABORT,'Past event cannot invalidate credited hours') END;
END;
--> statement-breakpoint
CREATE TRIGGER past_hours_no_delete BEFORE DELETE ON past_event_hours WHEN NOT EXISTS(SELECT 1 FROM account_deletions WHERE target=OLD.user_id)
 BEGIN SELECT RAISE(ABORT,'Past event hours are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER past_hours_no_update BEFORE UPDATE ON past_event_hours
 WHEN NOT (NEW.actor='__deleted_actor__' AND NEW.id IS OLD.id AND NEW.event_id IS OLD.event_id AND NEW.user_id IS OLD.user_id AND NEW.year IS OLD.year
 AND NEW.delta IS OLD.delta AND NEW.balance IS OLD.balance AND NEW.revision IS OLD.revision AND NEW.source IS OLD.source
 AND NEW.reason IS OLD.reason AND NEW.created_at IS OLD.created_at AND EXISTS(SELECT 1 FROM account_deletions WHERE target=OLD.actor))
 BEGIN SELECT RAISE(ABORT,'Past event hours are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER past_account_purge BEFORE DELETE ON users WHEN EXISTS(SELECT 1 FROM account_deletions WHERE target=OLD.id) BEGIN
 DELETE FROM past_event_hours WHERE user_id=OLD.id;
 UPDATE past_event_hours SET actor='__deleted_actor__' WHERE actor=OLD.id;
 UPDATE past_events SET coordinator=(SELECT actor FROM account_deletions WHERE target=OLD.id LIMIT 1) WHERE coordinator=OLD.id;
END;
--> statement-breakpoint
DROP VIEW service_credits;
--> statement-breakpoint
CREATE VIEW service_credits AS
 SELECT l.id,l.attendance_id,l.user_id,l.year,l.delta,l.reason,l.actor,l.revision,l.created_at,e.title event_title,e.coordinator,'attendance' source
 FROM hour_ledger l JOIN attendance a ON a.id=l.attendance_id JOIN events e ON e.id=a.event_id
 UNION ALL
 SELECT h.id,NULL,h.user_id,h.year,h.delta,h.reason||' | Source: '||h.source,h.actor,h.revision,h.created_at,
 'Historical service through 6 Oct 2026',h.actor,'historical' FROM historical_hours h
 UNION ALL
 SELECT h.id,NULL,h.user_id,h.year,h.delta,h.reason||' | Record: '||h.source||' | Event date: '||substr(e.start,1,10),h.actor,h.revision,h.created_at,
 e.title||' (past event)',e.coordinator,'past_event' FROM past_event_hours h JOIN past_events e ON e.id=h.event_id;
