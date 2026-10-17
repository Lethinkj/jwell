const express = require('express');
const { all } = require('../db');
const { auth, requireRoles, audit } = require('../middleware/auth');
const { DEFAULT_TEMPLATES, PLACEHOLDERS, TEMPLATE_KEYS, getTemplates, saveTemplate } = require('../services/emailTemplates');
const mailer = require('../services/mailer');
const { sendTemplate, sendOffers, shopVars } = require('../services/email');

const router = express.Router();
router.use(auth);
router.use(requireRoles('admin'));

function maskEmail(email) {
  if (!email) return '';
  const [u, d] = email.split('@');
  if (!d) return '***';
  return `${u.slice(0, 2)}***@${d}`;
}

// ---- Config + templates ----
router.get('/email/settings', async (req, res) => {
  const c = mailer.config();
  res.json({ data: {
    smtp: { configured: mailer.isConfigured(), host: c.host, port: c.port, secure: c.secure, from: c.from, user_masked: maskEmail(c.user) },
    templates: await getTemplates(req.user.shop_id),
    defaults: DEFAULT_TEMPLATES,
    keys: TEMPLATE_KEYS,
    placeholders: PLACEHOLDERS,
    shop: await shopVars(req.user.shop_id),
  } });
});

router.get('/email/status', async (req, res) => {
  res.json({ data: await mailer.verify() });
});

router.put('/email/templates/:key', async (req, res) => {
  const key = req.params.key;
  if (!TEMPLATE_KEYS.includes(key)) return res.status(400).json({ error: 'bad_request', message: `unknown template: ${key}` });
  const { subject, body, enabled } = req.body || {};
  if (subject !== undefined && !String(subject).trim()) return res.status(400).json({ error: 'bad_request', message: 'subject cannot be empty' });
  if (body !== undefined && !String(body).trim()) return res.status(400).json({ error: 'bad_request', message: 'body cannot be empty' });
  const saved = await saveTemplate(req.user.shop_id, key, { subject, body, enabled });
  audit(req.user.user_id, 'email.template_update', 'shop', req.user.shop_id, `template ${key} updated`);
  res.json({ data: { key, template: saved } });
});

// ---- Send a test email (uses purchase template with sample data) ----
router.post('/email/test', async (req, res) => {
  const to = String((req.body && req.body.to) || req.user.email || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return res.status(400).json({ error: 'bad_request', message: 'valid recipient email required' });
  if (!mailer.isConfigured()) return res.status(400).json({ error: 'smtp_not_configured', message: 'SMTP is not configured. Set SMTP_USER/SMTP_PASSWORD on the server.' });
  const vars = {
    customer_name: 'Test Customer',
    invoice_no: 'INV-TEST-00001',
    total: '₹45,000',
    date: new Date().toLocaleDateString('en-IN'),
  };
  const result = await sendTemplate(req.user.shop_id, 'purchase_thankyou', { to, vars, logKey: 'test', force: true });
  if (!result.ok) return res.status(502).json({ error: 'send_failed', message: result.error, data: result });
  audit(req.user.user_id, 'email.test', 'shop', req.user.shop_id, `test email to ${to}`);
  res.json({ data: { to, ...result } });
});

// ---- Send the offers email to consented customers ----
router.post('/email/offers/send', async (req, res) => {
  const { subject, body, offer_details } = req.body || {};
  if (!mailer.isConfigured()) return res.status(400).json({ error: 'smtp_not_configured', message: 'SMTP is not configured. Set SMTP_USER/SMTP_PASSWORD on the server.' });
  const result = await sendOffers(req.user.shop_id, { subject, body, offerDetails: offer_details });
  audit(req.user.user_id, 'email.offers_send', 'shop', req.user.shop_id, `offers email → ${result.recipients} recipients (sent ${result.sent}, failed ${result.failed}, skipped ${result.skipped})`);
  res.json({ data: result });
});

// ---- Recent outbound email log ----
router.get('/email/log', async (req, res) => {
  res.json({ data: await all('SELECT * FROM email_messages WHERE shop_id = ? ORDER BY created_at DESC LIMIT 100', req.user.shop_id) });
});

module.exports = router;
module.exports.shopVars = shopVars;
