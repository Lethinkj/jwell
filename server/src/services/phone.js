/** Phone normalization: digits only, with India-specific trunk/country handling.
 * The normalized value is the PRIMARY SEARCH KEY, never the permanent ID
 * (customer_id stays the immutable internal key). */

function normalizePhone(raw) {
  if (raw == null) return '';
  let d = String(raw).replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2); // +91 prefix
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1); // trunk 0
  else if (d.length === 13 && d.startsWith('091')) d = d.slice(3);
  return d;
}

function isValidPhone(raw) {
  const d = normalizePhone(raw);
  return d.length >= 7 && d.length <= 12;
}

module.exports = { normalizePhone, isValidPhone };
