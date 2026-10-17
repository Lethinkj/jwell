-- 0006 (Postgres): campaign scheduling + login reminders.
--
-- * sent_at marks when a campaign run finished. (campaign_recipients.sent_at
--   still records per-recipient delivery.)
-- * remind_at lets an admin snooze the "Send now / Remind later" prompt that
--   appears on login for approved, unsent campaigns.

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS remind_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_campaigns_schedule ON campaigns(shop_id, approval_status, schedule_at);
