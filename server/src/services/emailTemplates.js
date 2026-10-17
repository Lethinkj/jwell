/**
 * Email templates: code defaults + per-shop DB overrides.
 *
 * A shop always has a usable message: if no row is saved for a key, the code
 * default is returned. Saving a template replaces the default for that key
 * only. Placeholders use the `{{name}}` syntax.
 */
const { all, run } = require('../db');

const DEFAULT_TEMPLATES = {
  purchase_thankyou: {
    subject: 'Thank you for your purchase, {{customer_name}}!',
    body: `Dear {{customer_name}},

Thank you for shopping with {{shop_name}} — we truly appreciate your trust.

Invoice: {{invoice_no}}
Amount paid: {{total}}

We hope you love your new piece. Stay updated for exclusive offers, festive collections and member-only deals.

Warm regards,
{{shop_name}}
{{shop_phone}}`,
    enabled: 1,
  },
  offers: {
    subject: 'Exclusive offer from {{shop_name}}',
    body: `Dear {{customer_name}},

We have something special for you at {{shop_name}}!

{{offer_details}}

Visit us:
{{shop_name}}
{{shop_address}}
{{shop_phone}}`,
    enabled: 1,
  },
};

const TEMPLATE_KEYS = Object.keys(DEFAULT_TEMPLATES);

// Placeholders available for each template (shown in the admin UI).
const PLACEHOLDERS = {
  purchase_thankyou: ['customer_name', 'invoice_no', 'total', 'shop_name', 'shop_phone', 'shop_address'],
  offers: ['customer_name', 'offer_details', 'shop_name', 'shop_phone', 'shop_address'],
};

/** Merge DB overrides over code defaults for a shop. */
async function getTemplates(shopId) {
  const rows = await all('SELECT key, subject, body, enabled FROM email_templates WHERE shop_id = ?', shopId);
  const saved = Object.fromEntries(rows.map((r) => [r.key, r]));
  const out = {};
  for (const key of TEMPLATE_KEYS) {
    const def = DEFAULT_TEMPLATES[key];
    const row = saved[key];
    out[key] = {
      subject: row && row.subject ? row.subject : def.subject,
      body: row && row.body ? row.body : def.body,
      enabled: row ? Number(row.enabled) : 1,
      customized: !!(row && (row.subject || row.body)),
    };
  }
  return out;
}

/** Persist one template (upsert). Empty subject/body are ignored (default kept). */
async function saveTemplate(shopId, key, { subject, body, enabled }) {
  if (!TEMPLATE_KEYS.includes(key)) throw new Error(`unknown template: ${key}`);
  const def = DEFAULT_TEMPLATES[key];
  const s = subject !== undefined ? String(subject) : def.subject;
  const b = body !== undefined ? String(body) : def.body;
  const en = enabled !== undefined ? (enabled ? 1 : 0) : 1;
  const exists = (await all('SELECT 1 FROM email_templates WHERE shop_id = ? AND key = ?', shopId, key)).length > 0;
  if (exists) {
    await run(`UPDATE email_templates SET subject = ?, body = ?, enabled = ?, updated_at = now() WHERE shop_id = ? AND key = ?`,
      s, b, en, shopId, key);
  } else {
    await run(`INSERT INTO email_templates (shop_id, key, subject, body, enabled) VALUES (?,?,?,?,?)`,
      shopId, key, s, b, en);
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

/** Render a template into subject/text/html for a set of variables. */
function renderTemplate(tpl, vars = {}) {
  const subject = substitute(tpl.subject, vars);
  const text = substitute(tpl.body, vars);
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#3B302B;max-width:560px">
  ${escapeHtml(text).replace(/\n/g, '<br/>')}
</div>`;
  return { subject, text, html };
}

module.exports = { DEFAULT_TEMPLATES, TEMPLATE_KEYS, PLACEHOLDERS, getTemplates, saveTemplate, renderTemplate, substitute };
