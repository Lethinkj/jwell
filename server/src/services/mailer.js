/**
 * Outbound mail via Google SMTP (nodemailer).
 *
 * Configuration is environment-based (never stored in the DB):
 *   SMTP_HOST (default smtp.gmail.com)
 *   SMTP_PORT (default 465)
 *   SMTP_SECURE (default true)
 *   SMTP_USER / SMTP_EMAIL — the sending Google account
 *   SMTP_PASSWORD / SMTP_PASS — 16-char Google App Password (spaces ignored)
 *   SMTP_FROM_NAME — display name for the From header
 *   MAIL_DISABLED=true — suppress all sends (tests)
 */
const nodemailer = require('nodemailer');

function config() {
  const user = (process.env.SMTP_USER || process.env.SMTP_EMAIL || '').trim();
  // Google shows app passwords grouped as "abcd efgh ijkl mnop"; the real value
  // has no spaces.
  const pass = (process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '').replace(/\s+/g, '');
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = String(process.env.SMTP_SECURE || 'true') === 'true';
  const fromName = process.env.SMTP_FROM_NAME || 'Shree Gold Palace';
  const from = user ? `${fromName} <${user}>` : '';
  return { user, pass, host, port, secure, from, fromName };
}

/** True only when credentials exist and sending is not disabled. */
function isConfigured() {
  const c = config();
  return !!(c.user && c.pass) && process.env.MAIL_DISABLED !== 'true';
}

let _transporter = null;
function transporter() {
  if (_transporter) return _transporter;
  const c = config();
  _transporter = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure,
    auth: { user: c.user, pass: c.pass },
  });
  return _transporter;
}

/** Verify SMTP credentials/reachability. */
async function verify() {
  if (!isConfigured()) return { ok: false, error: 'smtp_not_configured' };
  try {
    await transporter().verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Send one email. Never throws — returns { ok, messageId } or { ok:false, error }. */
async function sendMail({ to, subject, text, html, replyTo }) {
  if (process.env.MAIL_DISABLED === 'true') return { ok: false, error: 'mail_disabled' };
  const c = config();
  if (!c.user || !c.pass) return { ok: false, error: 'smtp_not_configured' };
  try {
    const info = await transporter().sendMail({
      from: c.from,
      to,
      subject,
      text,
      html,
      replyTo: replyTo || c.user,
    });
    return { ok: true, messageId: info.messageId, response: info.response };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { config, isConfigured, verify, sendMail };
