-- 0003 (SQLite, kept for reference — server is Postgres-only): offers.created_at.
ALTER TABLE offers ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'));
