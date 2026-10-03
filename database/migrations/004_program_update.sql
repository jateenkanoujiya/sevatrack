-- Append-only opening balances for service completed before 7 October 2026 (India).
CREATE TABLE historical_hours (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), year INTEGER NOT NULL CHECK(year IN (1,2)),
 delta REAL NOT NULL CHECK(delta BETWEEN -1000 AND 1000 AND abs(delta*100-round(delta*100))<0.000001),
 balance REAL NOT NULL CHECK(balance BETWEEN 0 AND 1000), revision INTEGER NOT NULL CHECK(revision>0),
 source TEXT NOT NULL CHECK(length(trim(source)) BETWEEN 1 AND 500),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 1000),
 service_through TEXT NOT NULL CHECK(service_through='2026-10-06'),
 actor TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 UNIQUE(user_id,year,revision)
);
--> statement-breakpoint
CREATE TRIGGER historical_authorize BEFORE INSERT ON historical_hours BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND role='STUDENT')
 OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.actor AND active=1 AND
 (role='ADMIN' OR (role='FACULTY' AND strftime('%Y-%m-%dT%H:%M:%fZ','now')<'2026-10-07T18:30:00.000Z')))
 THEN RAISE(ABORT,'Historical entry is restricted or the faculty deadline has passed') END;
 SELECT CASE WHEN NEW.revision!=COALESCE((SELECT MAX(revision) FROM historical_hours WHERE user_id=NEW.user_id AND year=NEW.year),0)+1
 OR abs(NEW.balance-ROUND(COALESCE((SELECT SUM(delta) FROM historical_hours WHERE user_id=NEW.user_id AND year=NEW.year),0)+NEW.delta,2))>0.000001
 THEN RAISE(ABORT,'Historical balance changed; refresh before saving') END;
END;
--> statement-breakpoint
CREATE TRIGGER historical_no_update BEFORE UPDATE ON historical_hours
 WHEN NOT (NEW.actor='__deleted_actor__' AND NEW.id IS OLD.id AND NEW.user_id IS OLD.user_id AND NEW.year IS OLD.year
 AND NEW.delta IS OLD.delta AND NEW.balance IS OLD.balance AND NEW.revision IS OLD.revision AND NEW.source IS OLD.source
 AND NEW.reason IS OLD.reason AND NEW.service_through IS OLD.service_through AND NEW.created_at IS OLD.created_at
 AND EXISTS(SELECT 1 FROM account_deletions WHERE target=OLD.actor))
 BEGIN SELECT RAISE(ABORT,'Historical hours are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER historical_no_delete BEFORE DELETE ON historical_hours
 WHEN NOT EXISTS(SELECT 1 FROM account_deletions WHERE target=OLD.user_id)
 BEGIN SELECT RAISE(ABORT,'Historical hours are immutable outside confirmed account deletion'); END;
--> statement-breakpoint
CREATE TRIGGER historical_account_purge BEFORE DELETE ON users
 WHEN EXISTS(SELECT 1 FROM account_deletions WHERE target=OLD.id) BEGIN
 DELETE FROM historical_hours WHERE user_id=OLD.id;
 UPDATE historical_hours SET actor='__deleted_actor__' WHERE actor=OLD.id;
END;
--> statement-breakpoint
CREATE VIEW service_credits AS
 SELECT l.id,l.attendance_id,l.user_id,l.year,l.delta,l.reason,l.actor,l.revision,l.created_at,e.title event_title,e.coordinator,'attendance' source
 FROM hour_ledger l JOIN attendance a ON a.id=l.attendance_id JOIN events e ON e.id=a.event_id
 UNION ALL
 SELECT h.id,NULL,h.user_id,h.year,h.delta,h.reason||' | Source: '||h.source,h.actor,h.revision,h.created_at,
 'Historical service through 6 Oct 2026',h.actor,'historical'
 FROM historical_hours h;
--> statement-breakpoint
INSERT INTO catalogs(id,kind,name,details) VALUES('nss-category-0','category','General Orientation','{"group": "Regular activities", "description": "Introduction to NSS, volunteering responsibilities and the service programme."}') ON CONFLICT(kind,name) DO UPDATE SET details=json_patch(excluded.details,catalogs.details);
--> statement-breakpoint
INSERT INTO catalogs(id,kind,name,details) VALUES('nss-category-1','category','Campus Work','{"group": "Regular activities", "description": "Improve and maintain shared campus spaces through organised service."}') ON CONFLICT(kind,name) DO UPDATE SET details=json_patch(excluded.details,catalogs.details);
--> statement-breakpoint
INSERT INTO catalogs(id,kind,name,details) VALUES('nss-category-2','category','Socio-Economic & Village Surveys','{"group": "Regular activities", "description": "Visit households to understand local needs, health and literacy."}') ON CONFLICT(kind,name) DO UPDATE SET details=json_patch(excluded.details,catalogs.details);
--> statement-breakpoint
INSERT INTO catalogs(id,kind,name,details) VALUES('nss-category-3','category','Health, Family Welfare & Awareness','{"group": "Regular activities", "description": "Blood donation, health checks, vaccination support and health awareness."}') ON CONFLICT(kind,name) DO UPDATE SET details=json_patch(excluded.details,catalogs.details);
--> statement-breakpoint
INSERT INTO catalogs(id,kind,name,details) VALUES('nss-category-4','category','Swachh Bharat & Cleanliness','{"group": "Regular activities", "description": "Clean campus or community spaces; practise waste segregation and composting."}') ON CONFLICT(kind,name) DO UPDATE SET details=json_patch(excluded.details,catalogs.details);
--> statement-breakpoint
INSERT INTO catalogs(id,kind,name,details) VALUES('nss-category-5','category','Environment & Conservation','{"group": "Regular activities", "description": "Plant and care for trees, conserve water and restore local water sources."}') ON CONFLICT(kind,name) DO UPDATE SET details=json_patch(excluded.details,catalogs.details);
--> statement-breakpoint
INSERT INTO catalogs(id,kind,name,details) VALUES('nss-category-6','category','National Days & Weeks','{"group": "Regular activities", "description": "Mark national days with service, awareness rallies, posters and pledges."}') ON CONFLICT(kind,name) DO UPDATE SET details=json_patch(excluded.details,catalogs.details);
--> statement-breakpoint
INSERT INTO catalogs(id,kind,name,details) VALUES('nss-category-7','category','Skill Development & Training','{"group": "Regular activities", "description": "Learn first aid, disaster preparedness, public speaking, self-defence and yoga."}') ON CONFLICT(kind,name) DO UPDATE SET details=json_patch(excluded.details,catalogs.details);
--> statement-breakpoint
INSERT INTO catalogs(id,kind,name,details) VALUES('nss-category-8','category','Shramdan & Community Assets','{"group": "Special camping", "description": "Work together to improve village roads, wells and water-saving structures."}') ON CONFLICT(kind,name) DO UPDATE SET details=json_patch(excluded.details,catalogs.details);
--> statement-breakpoint
INSERT INTO catalogs(id,kind,name,details) VALUES('nss-category-9','category','Village & Slum Upliftment','{"group": "Special camping", "description": "Support children, adult literacy and community education projects."}') ON CONFLICT(kind,name) DO UPDATE SET details=json_patch(excluded.details,catalogs.details);
--> statement-breakpoint
INSERT INTO catalogs(id,kind,name,details) VALUES('nss-category-10','category','Street Plays & Cultural Programmes','{"group": "Special camping", "description": "Use street plays and cultural activities to raise awareness of social issues."}') ON CONFLICT(kind,name) DO UPDATE SET details=json_patch(excluded.details,catalogs.details);
--> statement-breakpoint
INSERT INTO catalogs(id,kind,name,details) VALUES('nss-category-11','category','Disaster Relief & Emergency Support','{"group": "Special camping", "description": "Support authorised relief teams with food, supplies and community assistance."}') ON CONFLICT(kind,name) DO UPDATE SET details=json_patch(excluded.details,catalogs.details);
