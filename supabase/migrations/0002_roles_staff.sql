-- 0002: two-role model (admin/billing), staff fields, phone normalization,
-- barcode shop scope, shop settings. Idempotent-ish: guarded inserts where needed.

-- Staff fields on profiles
ALTER TABLE profiles ADD COLUMN phone TEXT;
ALTER TABLE profiles ADD COLUMN last_login_at TEXT;
ALTER TABLE profiles ADD COLUMN is_primary INTEGER NOT NULL DEFAULT 0;

-- Remap legacy roles to the two-role model
UPDATE profiles SET role = 'admin' WHERE role = 'owner';
UPDATE profiles SET role = 'billing' WHERE role IN ('manager', 'inventory');

-- Single primary admin per shop: oldest record wins (seed creates the owner first).
-- The is_primary = 0 guard keeps this a no-op on re-runs.
UPDATE profiles SET is_primary = 1 WHERE rowid IN (
  SELECT MIN(rowid) FROM profiles WHERE role = 'admin' AND active = 1 GROUP BY shop_id
) AND is_primary = 0;

-- Customer phone normalization (non-unique: shared numbers resolved by staff, never auto-merged)
ALTER TABLE customers ADD COLUMN normalized_phone TEXT;
UPDATE customers SET normalized_phone = phone WHERE normalized_phone IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_normphone ON customers(shop_id, normalized_phone);

-- Barcode shop scope (global UNIQUE kept — stricter; shop_id enables scoped checks)
ALTER TABLE product_barcodes ADD COLUMN shop_id TEXT REFERENCES shops(id);
UPDATE product_barcodes SET shop_id = (SELECT shop_id FROM products WHERE products.id = product_barcodes.product_id)
  WHERE shop_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_barcodes_shop_value ON product_barcodes(shop_id, barcode_value);

-- Shop settings (shop details, invoice, barcode/label, app settings)
CREATE TABLE IF NOT EXISTS shop_settings (
  shop_id TEXT NOT NULL REFERENCES shops(id),
  key TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (shop_id, key)
);
