/**
 * Email templates: code defaults + per-shop DB overrides.
 *
 * A shop always has a usable message: if no row is saved for a key, the code
 * default is returned. Saving a template replaces the default for that key
 * only. Placeholders use the `{{name}}` syntax. A template's `body_format` is
 * either 'text' (plain, newlines preserved) or 'html' (from the rich editor).
 *
 * Festival templates are NOT here — they are per-shop rows in the `festivals`
 * table (see services/festivals.js) because admins can add/remove them.
 */
const { all, run } = require('../db');

// Display sections in the admin Email page (order matters).
const CATEGORIES = [
  { id: 'transactional', label: 'Transactional' },
  { id: 'occasions', label: 'Occasions' },
  { id: 'festivals', label: 'Festivals' },
  { id: 'marketing', label: 'Marketing' },
];

const DEFAULT_TEMPLATES = {
  purchase_thankyou: {
    label: 'Purchase thank-you',
    category: 'transactional',
    body_format: 'text',
    subject: 'Thank you for your purchase, {{customer_name}}!',
    body: `Dear {{customer_name}},

Thank you for shopping with {{shop_name}} — we truly appreciate your trust.

Invoice: {{invoice_no}}
Amount paid: {{total}}

We hope you love your new piece. Stay updated for exclusive offers, festive collections and member-only deals.

Warm regards,
{{shop_name}}
{{shop_phone}}`,
  },
  birthday: {
    label: 'Birthday',
    category: 'occasions',
    body_format: 'html',
    subject: 'Happy Birthday, {{customer_name}}! 🎂',
    body: `<p>Dear {{customer_name}},</p>
<p>Wishing you a very Happy Birthday! 🎉 May this year bring you health, happiness and plenty of sparkle.</p>
<p>As a small token of our love, enjoy a special birthday treat on your next visit to <strong>{{shop_name}}</strong>.</p>
<p>With warm wishes,<br/>{{shop_name}}<br/>{{shop_phone}}</p>`,
  },
  anniversary: {
    label: 'Anniversary',
    category: 'occasions',
    body_format: 'html',
    subject: 'Happy Anniversary, {{customer_name}}! 💍',
    body: `<p>Dear {{customer_name}},</p>
<p>Congratulations on your wedding anniversary! 💐 We hope your journey together keeps shining brighter every year.</p>
<p>Celebrate the occasion with something special from <strong>{{shop_name}}</strong>.</p>
<p>Warm regards,<br/>{{shop_name}}<br/>{{shop_phone}}</p>`,
  },
  offers: {
    label: 'Offers & promotions',
    category: 'marketing',
    body_format: 'text',
    subject: 'Exclusive offer from {{shop_name}}',
    body: `Dear {{customer_name}},

We have something special for you at {{shop_name}}!

{{offer_details}}

Visit us:
{{shop_name}}
{{shop_address}}
{{shop_phone}}`,
  },
};

const TEMPLATE_KEYS = Object.keys(DEFAULT_TEMPLATES);

// Placeholders available for each template (shown in the admin UI).
const PLACEHOLDERS = {
  purchase_thankyou: ['customer_name', 'invoice_no', 'total', 'date', 'shop_name', 'shop_phone', 'shop_address'],
  birthday: ['customer_name', 'date', 'shop_name', 'shop_phone', 'shop_address'],
  anniversary: ['customer_name', 'years', 'date', 'shop_name', 'shop_phone', 'shop_address'],
  offers: ['customer_name', 'offer_details', 'shop_name', 'shop_phone', 'shop_address'],
};

const BODY_FORMATS = ['text', 'html'];

/** Merge DB overrides over code defaults for a shop. */
async function getTemplates(shopId) {
  const rows = await all('SELECT key, subject, body, enabled, body_format FROM email_templates WHERE shop_id = ?', shopId);
  const saved = Object.fromEntries(rows.map((r) => [r.key, r]));
  const out = {};
  for (const key of TEMPLATE_KEYS) {
    const def = DEFAULT_TEMPLATES[key];
    const row = saved[key];
    out[key] = {
      key,
      label: def.label,
      category: def.category,
      subject: row && row.subject ? row.subject : def.subject,
      body: row && row.body ? row.body : def.body,
      body_format: (row && row.body_format) || def.body_format,
      enabled: row ? Number(row.enabled) : 1,
      customized: !!(row && (row.subject || row.body)),
    };
  }
  return out;
}

/** Persist one template (upsert). Empty subject/body are ignored (default kept). */
async function saveTemplate(shopId, key, { subject, body, enabled, body_format }) {
  if (!TEMPLATE_KEYS.includes(key)) throw new Error(`unknown template: ${key}`);
  const def = DEFAULT_TEMPLATES[key];
  const s = subject !== undefined ? String(subject) : def.subject;
  const b = body !== undefined ? String(body) : def.body;
  const en = enabled !== undefined ? (enabled ? 1 : 0) : 1;
  const bf = BODY_FORMATS.includes(body_format) ? body_format : def.body_format;
  const exists = (await all('SELECT 1 FROM email_templates WHERE shop_id = ? AND key = ?', shopId, key)).length > 0;
  if (exists) {
    await run(`UPDATE email_templates SET subject = ?, body = ?, enabled = ?, body_format = ?, updated_at = now() WHERE shop_id = ? AND key = ?`,
      s, b, en, bf, shopId, key);
  } else {
    await run(`INSERT INTO email_templates (shop_id, key, subject, body, enabled, body_format) VALUES (?,?,?,?,?,?)`,
      shopId, key, s, b, en, bf);
  }
  return (await getTemplates(shopId))[key];
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Replace {{placeholder}} tokens with values (missing -> ''). */
function substitute(text, vars) {
  return String(text || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
}

/** Best-effort plain-text version of an HTML body (for the text/* MIME part). */
function htmlToText(html) {
  return String(html || '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const WRAP_STYLE = 'font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#3B302B;max-width:560px';
function wrapHtml(inner) {
  return `<div style="${WRAP_STYLE}">${inner}</div>`;
}

/** Render a template into subject/text/html for a set of variables. */
function renderTemplate(tpl, vars = {}) {
  const subject = substitute(tpl.subject, vars);
  const rawBody = substitute(tpl.body, vars);
  if (tpl.body_format === 'html') {
    return { subject, text: htmlToText(rawBody), html: wrapHtml(rawBody) };
  }
  const text = rawBody;
  return { subject, text, html: wrapHtml(escapeHtml(text).replace(/\n/g, '<br/>')) };
}

module.exports = {
  CATEGORIES, DEFAULT_TEMPLATES, TEMPLATE_KEYS, PLACEHOLDERS, BODY_FORMATS,
  getTemplates, saveTemplate, renderTemplate, substitute, escapeHtml, htmlToText,
};
