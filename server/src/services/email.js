/**
 * Email orchestration: render a stored/default template, send via the mailer,
 * and record the outcome in email_messages. Never throws on send failure —
 * billing must not be affected by email problems.
 */
const { all, run, uid } = require('../db');
const mailer = require('./mailer');
const { getTemplates, renderTemplate } = require('./emailTemplates');
const { getSettings } = require('../routes/admin');

async function logMessage(shopId, { to, customer_id, template_key, subject, status, error, provider_message_id }) {
  try {
    await run(`INSERT INTO email_messages (id, shop_id, to_email, customer_id, template_key, subject, status, error, provider_message_id)
      VALUES (?,?,?,?,?,?,?,?,?)`,
      uid('eml'), shopId, to, customer_id || null, template_key || null, subject || null, status, error || null, provider_message_id || null);
  } catch { /* logging must never break the caller */ }
}

/** Shop-level variables available to every template. */
async function shopVars(shopId) {
  const s = await getSettings(shopId);
  return {
    shop_name: s.shop_name,
    shop_phone: s.shop_phone,
    shop_address: s.shop_address,
    date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
  };
}

/**
 * Send one templated email.
 * @param override  { subject, body } — send unsaved edits instead of the stored template
 * @param logKey    template_key recorded in the log (defaults to `key`)
 * @param force     send even when the template is disabled (used for test sends)
 */
async function sendTemplate(shopId, key, { to, customer_id, vars = {}, override, logKey, force = false } = {}) {
  const templates = await getTemplates(shopId);
  const tpl = templates[key];
  if (!tpl) return { ok: false, error: 'unknown_template' };
  if (!tpl.enabled && !force) {
    await logMessage(shopId, { to, customer_id, template_key: logKey || key, status: 'skipped', error: 'template_disabled' });
    return { ok: false, error: 'template_disabled' };
  }
  const merged = {
    subject: override?.subject ?? tpl.subject,
    body: override?.body ?? tpl.body,
    body_format: override?.body_format ?? tpl.body_format,
  };
  const fullVars = { ...(await shopVars(shopId)), ...vars };
  const rendered = renderTemplate(merged, fullVars);
  const result = await mailer.sendMail({ to, subject: rendered.subject, text: rendered.text, html: rendered.html });
  const skipped = !result.ok && ['mail_disabled', 'smtp_not_configured'].includes(result.error);
  await logMessage(shopId, {
    to, customer_id, template_key: logKey || key, subject: rendered.subject,
    status: result.ok ? 'sent' : (skipped ? 'skipped' : 'failed'), error: result.error, provider_message_id: result.messageId,
  });
  return { ...result, subject: rendered.subject };
}

/** Fire-and-forget thank-you after a finalized sale. */
async function sendPurchaseThankYou(shopId, sale, customer) {
  if (!customer || !customer.email) return { ok: false, error: 'no_customer_email' };
  const total = `₹${Number(sale.total_inr || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  return sendTemplate(shopId, 'purchase_thankyou', {
    to: customer.email,
    customer_id: customer.id,
    vars: {
      customer_name: customer.name || 'Customer',
      invoice_no: sale.invoice_no || '',
      total,
      date: new Date().toLocaleDateString('en-IN'),
    },
  });
}

/** Send the offers/announcement email to every consented customer with an email. */
async function sendOffers(shopId, { subject, body, body_format, offerDetails } = {}) {
  const recipients = await all(
    `SELECT id, name, email FROM customers
     WHERE shop_id = ? AND marketing_consent = 1 AND email IS NOT NULL AND email <> ''`,
    shopId);
  let sent = 0, failed = 0, skipped = 0;
  for (const c of recipients) {
    const r = await sendTemplate(shopId, 'offers', {
      to: c.email,
      customer_id: c.id,
      override: (subject || body) ? { subject, body, body_format } : undefined,
      vars: { customer_name: c.name || 'Customer', offer_details: offerDetails || '' },
    });
    if (r.ok) sent++;
    else if (r.error === 'template_disabled' || r.error === 'mail_disabled' || r.error === 'smtp_not_configured') skipped++;
    else failed++;
  }
  return { recipients: recipients.length, sent, failed, skipped };
}

module.exports = { logMessage, sendTemplate, sendPurchaseThankYou, sendOffers, shopVars };
