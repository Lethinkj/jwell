-- 0005 (Postgres): occasion greetings (birthday/anniversary/festival) + send log.
--
-- * email_templates gains body_format ('text' | 'html') so the admin rich-text
--   editor can store formatted messages. Existing rows default to 'text'.
-- * festivals is a shop-scoped, admin-manageable list (seeded defaults are
--   inserted by the app/service, never here). Each festival carries its own
--   editable message.
-- * occasion_sends records every greeting attempt (manual + automatic) and
--   doubles as the duplicate guard for the daily auto-send job.

ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS body_format TEXT NOT NULL DEFAULT 'text';

CREATE TABLE IF NOT EXISTS festivals (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  name TEXT NOT NULL,
  festival_date DATE,
  recurring INTEGER NOT NULL DEFAULT 1,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  body_format TEXT NOT NULL DEFAULT 'html',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, name)
);
CREATE INDEX IF NOT EXISTS idx_festivals_shop ON festivals(shop_id, festival_date);

CREATE TABLE IF NOT EXISTS occasion_sends (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  customer_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  ref_id TEXT NOT NULL DEFAULT '',
  send_date DATE NOT NULL,
  template_key TEXT,
  status TEXT NOT NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_occasion_sends_lookup ON occasion_sends(shop_id, customer_id, kind, ref_id, send_date);
CREATE INDEX IF NOT EXISTS idx_occasion_sends_shop ON occasion_sends(shop_id, created_at);
