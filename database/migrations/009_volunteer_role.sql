-- Volunteer is a participant role; staff-only credit and deletion checks remain in place.
DROP TRIGGER authorize_account_deletion;
--> statement-breakpoint
CREATE TRIGGER authorize_account_deletion BEFORE INSERT ON account_deletions BEGIN
 SELECT CASE WHEN NEW.actor=NEW.target OR NEW.target='__deleted_actor__'
 OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.actor AND role='ADMIN' AND active=1 AND password=NEW.actor_password_hash)
 OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.target AND lower(email)=lower(NEW.confirmed_email) AND role IN ('STUDENT','VOLUNTEER','FACULTY','ADMIN'))
 THEN RAISE(ABORT,'Account deletion authorization changed. Refresh and try again.') END;
 END;
--> statement-breakpoint
DROP TRIGGER historical_authorize;
--> statement-breakpoint
CREATE TRIGGER historical_authorize BEFORE INSERT ON historical_hours BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND role IN ('STUDENT','VOLUNTEER'))
 OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.actor AND active=1 AND
 (role='ADMIN' OR (role='FACULTY' AND strftime('%Y-%m-%dT%H:%M:%fZ','now')<'2026-10-07T18:30:00.000Z')))
 THEN RAISE(ABORT,'Historical entry is restricted or the faculty deadline has passed') END;
 SELECT CASE WHEN NEW.revision!=COALESCE((SELECT MAX(revision) FROM historical_hours WHERE user_id=NEW.user_id AND year=NEW.year),0)+1
 OR abs(NEW.balance-ROUND(COALESCE((SELECT SUM(delta) FROM historical_hours WHERE user_id=NEW.user_id AND year=NEW.year),0)+NEW.delta,2))>0.000001
 THEN RAISE(ABORT,'Historical balance changed; refresh before saving') END;
END;
--> statement-breakpoint
DROP TRIGGER past_hours_authorize;
--> statement-breakpoint
CREATE TRIGGER past_hours_authorize BEFORE INSERT ON past_event_hours BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.actor AND active=1 AND role='ADMIN')
 OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND role IN ('STUDENT','VOLUNTEER'))
 OR NOT EXISTS(SELECT 1 FROM past_events WHERE id=NEW.event_id AND end<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND hours>=NEW.balance)
 THEN RAISE(ABORT,'Only an administrator may credit documented past service within event hours') END;
 SELECT CASE WHEN NEW.revision!=COALESCE((SELECT MAX(revision) FROM past_event_hours WHERE event_id=NEW.event_id AND user_id=NEW.user_id),0)+1
 OR abs(NEW.balance-ROUND(COALESCE((SELECT SUM(delta) FROM past_event_hours WHERE event_id=NEW.event_id AND user_id=NEW.user_id),0)+NEW.delta,2))>0.000001
 OR EXISTS(SELECT 1 FROM past_event_hours WHERE event_id=NEW.event_id AND user_id=NEW.user_id AND year!=NEW.year)
 THEN RAISE(ABORT,'Past service changed or NSS year differs; refresh before saving') END;
END;
