/**
 * Occasion greetings: upcoming birthdays/anniversaries/festivals within a
 * rolling window, manual send, and the daily automatic send job.
 *
 * Dates on customers are TEXT 'YYYY-MM-DD'. Only the month/day recurs, so all
 * matching is done on the next occurrence of that month/day (rolling forward a
 * year when it has already passed).
 */
const { all, get, run, uid } = require('../db');
const { getTemplates } = require('./emailTemplates');
const { sendTemplate } = require('./email');
const { ensureFestivalDefaults } = require('./festivals');
const { getSettings } = require('../routes/admin');

const DEFAULT_WINDOW_DAYS = 10;

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function startOfDay(now) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
function humanDate(d) {
  return typeof d === 'string' ? d : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Next occurrence of a 'YYYY-MM-DD' month/day from `now` (0..366 days). */
function nextOccurrence(dateStr, now) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''));
  if (!m) return null;
  const base = startOfDay(now);
  let occ = new Date(base.getFullYear(), Number(m[2]) - 1, Number(m[3]));
  if (occ < base) occ = new Date(base.getFullYear() + 1, Number(m[2]) - 1, Number(m[3]));
  return { occurrence: occ, daysUntil: Math.round((occ - base) / 86400000), years: occ.getFullYear() - Number(m[1]) };
}

function windowDays(settings) {
  const n = Number(settings && settings.occasion_window_days);
  return Number.isFinite(n) && n > 0 && n <= 60 ? n : DEFAULT_WINDOW_DAYS;
}

function customerItem(c, type, dateStr, now, days) {
  const n = nextOccurrence(dateStr, now);
  if (!n || n.daysUntil > days) return null;
  return {
    customer_id: c.id, name: c.name, phone: c.phone, email: c.email,
    marketing_consent: Number(c.marketing_consent) || 0,
    type, date: String(dateStr).slice(0, 10),
    occurrence_date: ymd(n.occurrence), days_until: n.daysUntil,
    years: type === 'anniversary' ? n.years : n.years,
    can_send: Number(c.marketing_consent) === 1 && !!c.email,
  };
}

/** Upcoming occasions for a shop within `days` (defaults to the shop setting). */
async function getUpcoming(shopId, days, now = new Date()) {
  const settings = await getSettings(shopId);
  const d = days != null ? Number(days) : windowDays(settings);
  const rows = await all(
    `SELECT id, name, phone, email, marketing_consent, birthday, anniversary
     FROM customers WHERE shop_id = ? AND (birthday IS NOT NULL OR anniversary IS NOT NULL)`,
    shopId);

  const birthdays = [];
  const anniversaries = [];
  for (const c of rows) {
    const b = customerItem(c, 'birthday', c.birthday, now, d);
    if (b) birthdays.push(b);
    const a = customerItem(c, 'anniversary', c.anniversary, now, d);
    if (a) anniversaries.push(a);
  }
  const byDays = (a, b) => a.days_until - b.days_until || String(a.name).localeCompare(String(b.name));
  birthdays.sort(byDays);
  anniversaries.sort(byDays);

  await ensureFestivalDefaults(shopId);
  const festRows = await all('SELECT * FROM festivals WHERE shop_id = ? AND enabled = 1', shopId);
  const festivals = [];
  for (const f of festRows) {
    const n = nextOccurrence(f.festival_date, now);
    if (!n || n.daysUntil > d) continue;
    if (!Number(f.recurring) && n.daysUntil > 0 && n.occurrence.getFullYear() !== startOfDay(now).getFullYear()) continue;
    festivals.push({
      id: f.id, name: f.name, festival_date: f.festival_date ? String(f.festival_date).slice(0, 10) : null,
      occurrence_date: ymd(n.occurrence), days_until: n.daysUntil, recurring: Number(f.recurring) || 0,
    });
  }
  festivals.sort((a, b) => a.days_until - b.days_until);

  const from = startOfDay(now);
  const to = new Date(from.getTime() + d * 86400000);
  return { window: { from: ymd(from), to: ymd(to), days: d }, birthdays, anniversaries, festivals };
}

async function recordSend(shopId, { customer_id, kind, ref_id, send_date, template_key, status, error }) {
  try {
    await run(`INSERT INTO occasion_sends (id, shop_id, customer_id, kind, ref_id, send_date, template_key, status, error)
      VALUES (?,?,?,?,?,?,?,?,?)`,
      uid('osd'), shopId, customer_id, kind, ref_id || '', send_date, template_key || null, status, error || null);
  } catch { /* logging must never break sending */ }
}

async function alreadySent(shopId, customer_id, kind, ref_id, send_date) {
  return !!(await get(
    `SELECT 1 FROM occasion_sends WHERE shop_id = ? AND customer_id = ? AND kind = ? AND ref_id = ? AND send_date = ? AND status = 'sent'`,
    shopId, customer_id, kind, ref_id || '', send_date));
}

function classify(r) {
  if (r.ok) return 'sent';
  if (r.error === 'template_disabled' || r.error === 'mail_disabled' || r.error === 'smtp_not_configured') return 'skipped';
  return 'failed';
}

/**
 * Send occasion greetings now.
 * @param kind          'birthday' | 'anniversary' | 'festival'
 * @param customerIds   optional explicit recipients (else derived)
 * @param festivalId    required for kind='festival'
 * @param subject/body/body_format   optional inline override (edit-before-send)
 */
async function sendOccasions(shopId, { kind, customerIds, festivalId, subject, body, body_format, includeNonConsent = false } = {}) {
  if (!['birthday', 'anniversary', 'festival'].includes(kind)) return { error: 'bad_kind' };
  const settings = await getSettings(shopId);
  const now = new Date();
  const sendDate = ymd(now);
  let templateKey = kind;
  let festival = null;
  let recipients = [];

  if (kind === 'festival') {
    festival = await get(`SELECT * FROM festivals WHERE id = ? AND shop_id = ?`, festivalId, shopId);
    if (!festival) return { error: 'festival_not_found' };
    templateKey = 'festival';
    if (Array.isArray(customerIds) && customerIds.length) {
      recipients = await all(`SELECT id, name, email, marketing_consent FROM customers WHERE shop_id = ? AND id IN (${customerIds.map(() => '?').join(',')})`, shopId, ...customerIds);
    } else {
      recipients = await all(`SELECT id, name, email, marketing_consent FROM customers WHERE shop_id = ? AND marketing_consent = 1 AND email IS NOT NULL AND email <> ''`, shopId);
    }
  } else {
    if (Array.isArray(customerIds) && customerIds.length) {
      recipients = await all(`SELECT id, name, email, marketing_consent FROM customers WHERE shop_id = ? AND id IN (${customerIds.map(() => '?').join(',')})`, shopId, ...customerIds);
    } else {
      const up = await getUpcoming(shopId, windowDays(settings), now);
      const list = kind === 'birthday' ? up.birthdays : up.anniversaries;
      const ids = [...new Set(list.map((x) => x.customer_id))];
      recipients = ids.length
        ? await all(`SELECT id, name, email, marketing_consent FROM customers WHERE shop_id = ? AND id IN (${ids.map(() => '?').join(',')})`, shopId, ...ids)
        : [];
    }
  }

  const baseVars = { occasion_date: humanDate(now), years: '' };
  const results = [];
  let sent = 0, failed = 0, skipped = 0;
  for (const c of recipients) {
    if (!includeNonConsent && Number(c.marketing_consent) !== 1) { skipped++; results.push({ customer_id: c.id, status: 'skipped', error: 'no_consent' }); continue; }
    if (!c.email) { skipped++; results.push({ customer_id: c.id, status: 'skipped', error: 'no_email' }); continue; }

    let override;
    if (subject !== undefined || body !== undefined) {
      override = { subject, body, body_format: body_format || 'html' };
    } else if (kind === 'festival') {
      override = { subject: festival.subject, body: festival.body, body_format: festival.body_format || 'html' };
    }
    const vars = {
      ...baseVars,
      customer_name: c.name || 'Customer',
      festival_name: festival ? festival.name : '',
      festival_date: festival && festival.festival_date ? String(festival.festival_date).slice(0, 10) : '',
      years: kind === 'anniversary' ? anniversaryYears(shopId, c.id, now) : ageYears(shopId, c.id, now),
    };
    const r = await sendTemplate(shopId, templateKey, { to: c.email, customer_id: c.id, override, vars, logKey: templateKey });
    const status = classify(r);
    if (status === 'sent') sent++; else if (status === 'skipped') skipped++; else failed++;
    await recordSend(shopId, {
      customer_id: c.id, kind, ref_id: festival ? festival.id : '', send_date: sendDate,
      template_key: templateKey, status, error: r.error,
    });
    results.push({ customer_id: c.id, name: c.name, email: c.email, status, error: r.error });
  }
  return { recipients: recipients.length, sent, failed, skipped, results };
}

// Fetch the customer's stored date to compute age/years for the variable.
async function customerDate(shopId, customerId, col) {
  if (!['birthday', 'anniversary'].includes(col)) return null;
  const c = await get(`SELECT ${col} AS d FROM customers WHERE id = ? AND shop_id = ?`, customerId, shopId);
  return c ? c.d : null;
}
async function ageYears(shopId, customerId, now) {
  const d = await customerDate(shopId, customerId, 'birthday');
  const n = d ? nextOccurrence(d, now) : null;
  return n ? n.years : '';
}
async function anniversaryYears(shopId, customerId, now) {
  const d = await customerDate(shopId, customerId, 'anniversary');
  const n = d ? nextOccurrence(d, now) : null;
  return n ? n.years : '';
}

/** Automatic send for a single shop on `now` (only consenting recipients). */
async function runShopDaily(shopId, now) {
  const up = await getUpcoming(shopId, 0, now);
  const sendDate = ymd(now);
  const out = { sent: 0, skipped: 0, failed: 0 };
  const results = [];

  const handle = async (item, kind, festival) => {
    if (!item.can_send && kind !== 'festival') { return; }
    const refId = festival ? festival.id : '';
    if (await alreadySent(shopId, item.customer_id, kind, refId, sendDate)) return;
    let override;
    if (festival) override = { subject: festival.subject, body: festival.body, body_format: festival.body_format || 'html' };
    const vars = {
      customer_name: item.name || 'Customer',
      occasion_date: humanDate(now),
      years: item.years || '',
      festival_name: festival ? festival.name : '',
    };
    const r = await sendTemplate(shopId, kind, { to: item.email, customer_id: item.customer_id, override, vars, logKey: kind });
    const status = classify(r);
    out[status] = (out[status] || 0) + 1;
    await recordSend(shopId, { customer_id: item.customer_id, kind, ref_id: refId, send_date: sendDate, template_key: kind, status, error: r.error });
    results.push({ customer_id: item.customer_id, kind, status, error: r.error });
  };

  for (const b of up.birthdays) await handle({ ...b, email: b.email, name: b.name }, 'birthday');
  for (const a of up.anniversaries) await handle({ ...a, email: a.email, name: a.name }, 'anniversary');

  // Festivals: greet every consenting customer with an email.
  for (const f of up.festivals) {
    const full = await get('SELECT * FROM festivals WHERE id = ?', f.id);
    const recipients = await all(
      `SELECT id, name, email FROM customers WHERE shop_id = ? AND marketing_consent = 1 AND email IS NOT NULL AND email <> ''`, shopId);
    for (const c of recipients) {
      if (await alreadySent(shopId, c.id, 'festival', full.id, sendDate)) continue;
      const r = await sendTemplate(shopId, 'festival', {
        to: c.email, customer_id: c.id, logKey: 'festival',
        override: { subject: full.subject, body: full.body, body_format: full.body_format || 'html' },
        vars: { customer_name: c.name || 'Customer', festival_name: full.name, occasion_date: humanDate(now) },
      });
      const status = classify(r);
      out[status] = (out[status] || 0) + 1;
      await recordSend(shopId, { customer_id: c.id, kind: 'festival', ref_id: full.id, send_date: sendDate, template_key: 'festival', status, error: r.error });
      results.push({ customer_id: c.id, kind: 'festival', status, error: r.error });
    }
  }
  return { ...out, results };
}

/** Run the automatic occasion greetings for every shop that opted in. */
async function runDailyOccasions(now = new Date()) {
  const shops = await all('SELECT id FROM shops');
  const summary = { shops: 0, sent: 0, skipped: 0, failed: 0 };
  for (const s of shops) {
    const settings = await getSettings(s.id);
    if (String(settings.occasion_autosend) !== 'yes') continue;
    summary.shops++;
    const r = await runShopDaily(s.id, now);
    summary.sent += r.sent; summary.skipped += r.skipped; summary.failed += r.failed;
  }
  return summary;
}

let _timer = null;
let _lastRun = '';
/** Start the in-process daily job (once per day). Safe to call repeatedly. */
function startOccasionScheduler({ intervalMs = 60 * 60 * 1000 } = {}) {
  if (_timer) return _timer;
  const tick = async () => {
    const day = ymd(new Date());
    if (_lastRun === day) return;
    try {
      const r = await runDailyOccasions(new Date());
      _lastRun = day;
      if (r.shops) console.log(`[occasions] daily auto-send: ${r.sent} sent, ${r.skipped} skipped, ${r.failed} failed across ${r.shops} shop(s)`);
    } catch (e) {
      console.error('[occasions] auto-send failed:', e.message);
    }
  };
  tick();
  _timer = setInterval(tick, intervalMs);
  if (_timer.unref) _timer.unref();
  return _timer;
}

module.exports = { getUpcoming, sendOccasions, runDailyOccasions, runShopDaily, startOccasionScheduler, nextOccurrence, ymd };
