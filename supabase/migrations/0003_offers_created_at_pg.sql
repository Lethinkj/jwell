-- 0003 (Postgres): offers.created_at was missing but the API orders offers by it.
-- Applied once per database (tracked in schema_migrations).
ALTER TABLE offers ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();
