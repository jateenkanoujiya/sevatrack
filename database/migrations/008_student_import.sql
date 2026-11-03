ALTER TABLE users ADD COLUMN mobile TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE users ADD COLUMN password_change_required INTEGER NOT NULL DEFAULT 0 CHECK(password_change_required IN (0,1));
