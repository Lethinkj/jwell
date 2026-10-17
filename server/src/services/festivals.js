/**
 * Festival greetings are shop-scoped rows (admin-managed). This module holds
 * the seed list used to populate a shop the first time and a lazy
 * `ensureFestivalDefaults` so existing shops get them without a data migration.
 */
const { all, get, run, uid } = require('../db');

// Dates are the next known occurrence; admins can edit them (and add their own).
const DEFAULT_FESTIVALS = [
  { name: 'Dhanteras', date: '2026-11-06' },
  { name: 'Diwali', date: '2026-11-08' },
  { name: 'Bhai Dooj', date: '2026-11-11' },
  { name: 'Karwa Chauth', date: '2026-10-29' },
  { name: 'Christmas', date: '2026-12-25' },
  { name: 'New Year', date: '2027-01-01' },
  { name: 'Akshaya Tritiya', date: '2026-04-19' },
  { name: 'Raksha Bandhan', date: '2026-08-28' },
  { name: 'Ganesh Chaturthi', date: '2026-09-14' },
  { name: 'Navratri', date: '2026-10-11' },
  { name: 'Pongal', date: '2026-01-14' },
  { name: 'Holi', date: '2026-03-04' },
  { name: 'Ugadi', date: '2026-03-19' },
];

function defaultMessage(name) {
  return {
    subject: `Happy ${name}, {{customer_name}}! ✨`,
    body: `<p>Dear {{customer_name}},</p>
<p>Warm wishes from all of us at <strong>{{shop_name}}</strong> this ${name}. May the occasion bring you joy, prosperity and sparkle.</p>
<p>Visit us for our festive collection and exclusive offers.</p>
<p>— {{shop_name}}<br/>{{shop_phone}}</p>`,
  };
}

/** Insert the seed festivals for a shop if it has none yet. Returns rows count added. */
async function ensureFestivalDefaults(shopId) {
  const existing = await get('SELECT COUNT(*) AS n FROM festivals WHERE shop_id = ?', shopId);
  if (Number(existing.n) > 0) return 0;
  for (const f of DEFAULT_FESTIVALS) {
    const msg = defaultMessage(f.name);
    await run(`INSERT INTO festivals (id, shop_id, name, festival_date, recurring, subject, body, body_format, enabled)
      VALUES (?,?,?,?,1,?,?,?,1)`, uid('fes'), shopId, f.name, f.date, msg.subject, msg.body, 'html');
  }
  return DEFAULT_FESTIVALS.length;
}

module.exports = { DEFAULT_FESTIVALS, ensureFestivalDefaults };
