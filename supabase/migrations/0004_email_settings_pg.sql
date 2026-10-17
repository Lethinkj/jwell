-- 0004 (Postgres): customizable email templates + outbound email log.
-- Templates are shop-scoped; missing rows fall back to code defaults so the
-- shop always has a working message. SMTP credentials stay in the environment.

CREATE TABLE IF NOT EXISTS email_templates (
  shop_id TEXT NOT NULL REFERENCES shops(id),
  key TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (shop_id, key)
);

CREATE TABLE IF NOT EXISTS email_messages (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  to_email TEXT NOT NULL,
  customer_id TEXT,
  template_key TEXT,
  subject TEXT,
  status TEXT NOT NULL,
  error TEXT,
  provider_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_messages_shop ON email_messages(shop_id, created_at);
