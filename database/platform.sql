-- Platform control data lives only in the original database, never in institute databases.
CREATE TABLE IF NOT EXISTS platform_owner (singleton INTEGER PRIMARY KEY CHECK(singleton=1),user_id TEXT NOT NULL UNIQUE);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS platform_institutes (
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, city TEXT NOT NULL,
 website TEXT NOT NULL, contact_name TEXT NOT NULL, email TEXT NOT NULL, mobile TEXT NOT NULL,
 password_hash TEXT, status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROVISIONING','SETUP_FAILED','ACTIVE','REJECTED','SUSPENDED')),
 credentials TEXT, database_host TEXT UNIQUE, decision_reason TEXT NOT NULL DEFAULT '',
 failure_message TEXT NOT NULL DEFAULT '', lease TEXT, lease_until TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, reviewed_by TEXT, approved_at TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS platform_institutes_status ON platform_institutes(status,created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS platform_sessions (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS platform_rate_limits (key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS platform_audit (id TEXT PRIMARY KEY,actor TEXT NOT NULL,institute_id TEXT,action TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL);
