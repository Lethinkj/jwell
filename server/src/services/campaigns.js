/**
 * Campaign delivery + scheduling.
 *
 * * Manual campaigns are approved by an admin, then either sent from the
 *   Offers & Campaigns page or prompted on login ("Send now / Remind later").
 * * Campaigns with a schedule_at date are sent automatically by the scheduler
 *   once that date has passed (per shop, opt-in stays consent-gated).
 * * Every recipient send is idempotent (campaign_recipients.idempotency_key);
 *   opted-out recipients are skipped, never messaged.
 */
const { get, all, run, nowFn } = require('../db');
const { audit } = require('../middleware/auth');

function httpError(status, code, message) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
}

/** Deliver a campaign's queued recipients. Consent-gated; idempotent. */
async function sendCampaign(campaignId, { actorId = null } = {}) {
  const cam = await get('SELECT * FROM campaigns WHERE id = ?', campaignId);
  if (!cam) throw httpError(404, 'not_found', 'Campaign not found');
  if (cam.approval_status !== 'approved') {
    throw httpError(409, 'not_approved', 'Manual campaigns need explicit approval before send (§10 acceptance)');
  }
  const pending = await all(`SELECT r.*, c.phone, c.marketing_consent FROM campaign_recipients r
    JOIN customers c ON c.id = r.customer_id
    WHERE r.campaign_id = ? AND r.status = 'queued'`, cam.id);
  let sent = 0, skipped = 0;
  for (const r of pending) {
    if (!r.marketing_consent) {
      await run(`UPDATE campaign_recipients SET status='skipped', error=? WHERE id=?`, 'opted-out', r.id);
      skipped++;
      continue;
    }
    await run(`UPDATE campaign_recipients SET status='sent', provider_message_id=?, sent_at=${nowFn()} WHERE id=?`,
      `mock_${r.id}`, r.id);
    sent++;
  }
  await run(`UPDATE campaigns SET sent_at = ${nowFn()}, remind_at = NULL WHERE id = ?`, cam.id);
  if (actorId) await audit(actorId, 'campaign.send', 'campaign', cam.id, `sent ${sent}, skipped ${skipped}`);
  return { sent, skipped };
}

/** Approved, unsent campaigns that are due and not snoozed — the login prompt. */
async function listReminders(shopId) {
  return all(`SELECT * FROM campaigns
    WHERE shop_id = ? AND approval_status = 'approved' AND sent_at IS NULL
      AND (schedule_at IS NULL OR schedule_at::timestamptz <= now())
      AND (remind_at IS NULL OR remind_at <= now())
    ORDER BY COALESCE(schedule_at::timestamptz, created_at) ASC`, shopId);
}

/** Push the login prompt for a campaign out by `hours` (default 24). */
async function snoozeCampaign(id, shopId, hours = 24) {
  await run(`UPDATE campaigns SET remind_at = now() + (? || ' hours')::interval WHERE id = ? AND shop_id = ?`,
    String(hours), id, shopId);
  return get('SELECT * FROM campaigns WHERE id = ? AND shop_id = ?', id, shopId);
}

/** Send every approved, unsent campaign whose schedule date has arrived. */
async function runDueCampaigns() {
  const due = await all(`SELECT * FROM campaigns
    WHERE approval_status = 'approved' AND sent_at IS NULL
      AND schedule_at IS NOT NULL AND schedule_at::timestamptz <= now()`);
  const summary = { campaigns: 0, sent: 0, skipped: 0 };
  for (const cam of due) {
    try {
      const r = await sendCampaign(cam.id, { actorId: cam.created_by });
      summary.campaigns++;
      summary.sent += r.sent;
      summary.skipped += r.skipped;
    } catch (e) {
      console.error(`[campaigns] scheduled send ${cam.id} failed:`, e.message);
    }
  }
  return summary;
}

let _timer = null;
let _lastHour = '';
/** Hourly in-process job that sends campaigns whose date has arrived. */
function startCampaignScheduler({ intervalMs = 15 * 60 * 1000 } = {}) {
  if (_timer) return _timer;
  const tick = async () => {
    const hour = new Date().toISOString().slice(0, 13);
    if (_lastHour === hour) return;
    try {
      const r = await runDueCampaigns();
      _lastHour = hour;
      if (r.campaigns) console.log(`[campaigns] scheduled send: ${r.sent} sent, ${r.skipped} skipped across ${r.campaigns} campaign(s)`);
    } catch (e) {
      console.error('[campaigns] scheduler failed:', e.message);
    }
  };
  tick();
  _timer = setInterval(tick, intervalMs);
  if (_timer.unref) _timer.unref();
  return _timer;
}

module.exports = { sendCampaign, listReminders, snoozeCampaign, runDueCampaigns, startCampaignScheduler };
