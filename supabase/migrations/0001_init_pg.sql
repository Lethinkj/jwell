-- Gold Jewellery Shop Management System — Supabase (Postgres) schema. §8
-- Run in Supabase SQL Editor, or via:  npm run migrate -w server
-- (needs DATABASE_URL = Supabase project connection string).
-- Same tables/columns as 0001_init.sql; only timestamp defaults are Postgres-native.
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS shops (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  currency TEXT NOT NULL DEFAULT 'INR', settings TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY, shop_id TEXT NOT NULL REFERENCES shops(id),
  name TEXT NOT NULL, address TEXT, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY, shop_id TEXT REFERENCES shops(id), role TEXT NOT NULL,
  display_name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
  password_hash TEXT NOT NULL, email TEXT UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY, shop_id TEXT NOT NULL REFERENCES shops(id),
  name TEXT NOT NULL, slug TEXT NOT NULL, sku_prefix TEXT NOT NULL DEFAULT 'GEN',
  custom INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(shop_id, slug), UNIQUE(shop_id, sku_prefix)
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY, shop_id TEXT NOT NULL REFERENCES shops(id),
  category_id TEXT REFERENCES categories(id),
  sku TEXT NOT NULL, design_code TEXT, name TEXT NOT NULL, purity TEXT NOT NULL DEFAULT '22K',
  gross_weight_g DOUBLE PRECISION NOT NULL CHECK (gross_weight_g > 0),
  stone_weight_g DOUBLE PRECISION NOT NULL DEFAULT 0,
  net_gold_weight_g DOUBLE PRECISION NOT NULL CHECK (net_gold_weight_g > 0),
  making_charge_type TEXT NOT NULL DEFAULT 'percentage',
  making_charge_value DOUBLE PRECISION NOT NULL DEFAULT 10,
  stone_value_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  wastage_charge_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  other_charges_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  acquisition_cost_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  image_url TEXT, status TEXT NOT NULL DEFAULT 'available',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ,
  UNIQUE(shop_id, sku)
);
CREATE INDEX IF NOT EXISTS idx_products_shop ON products(shop_id);
CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE TABLE IF NOT EXISTS product_barcodes (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  barcode_value TEXT NOT NULL UNIQUE, barcode_type TEXT NOT NULL DEFAULT 'CODE128', active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY, shop_id TEXT NOT NULL REFERENCES shops(id),
  name TEXT NOT NULL, phone TEXT, email TEXT, address TEXT, payment_terms TEXT
);
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY, shop_id TEXT NOT NULL REFERENCES shops(id),
  supplier_id TEXT REFERENCES suppliers(id), supplier_invoice_no TEXT,
  purchased_at TIMESTAMPTZ NOT NULL, subtotal_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid', created_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS purchase_items (
  id TEXT PRIMARY KEY, purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  acquisition_cost_inr DOUBLE PRECISION NOT NULL, weight_snapshot_g DOUBLE PRECISION, status TEXT DEFAULT 'received'
);
CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id),
  branch_id TEXT REFERENCES branches(id), movement_type TEXT NOT NULL,
  qty_delta INTEGER NOT NULL DEFAULT 0, weight_delta_g DOUBLE PRECISION NOT NULL DEFAULT 0,
  reference_type TEXT, reference_id TEXT, reason TEXT, actor_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(product_id);
CREATE TABLE IF NOT EXISTS gold_rates (
  id TEXT PRIMARY KEY, source TEXT NOT NULL DEFAULT 'manual',
  purity_basis TEXT NOT NULL DEFAULT '24K', rate_per_g_inr DOUBLE PRECISION NOT NULL,
  rate_24k_per_g_inr DOUBLE PRECISION NOT NULL, currency TEXT NOT NULL DEFAULT 'INR', unit TEXT NOT NULL DEFAULT 'gram',
  observed_at TIMESTAMPTZ NOT NULL, fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved INTEGER NOT NULL DEFAULT 1, override_reason TEXT, created_by TEXT
);
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY, shop_id TEXT NOT NULL REFERENCES shops(id),
  customer_code TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL,
  email TEXT, notes TEXT, preferred_channel TEXT NOT NULL DEFAULT 'both',
  marketing_consent INTEGER NOT NULL DEFAULT 0,
  birthday TEXT, anniversary TEXT,
  address_line1 TEXT, city TEXT, state TEXT, postal_code TEXT,
  total_spent_inr DOUBLE PRECISION NOT NULL DEFAULT 0, purchase_count INTEGER NOT NULL DEFAULT 0,
  last_purchase_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(shop_id, customer_code)
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_shop ON customers(shop_id);
CREATE TABLE IF NOT EXISTS customer_addresses (
  id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  address_line1 TEXT, city TEXT, state TEXT, postal_code TEXT, type TEXT DEFAULT 'home'
);
CREATE TABLE IF NOT EXISTS customer_occasions (
  id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  occasion_type TEXT NOT NULL, occasion_date TEXT NOT NULL, notes TEXT
);
CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY, shop_id TEXT NOT NULL REFERENCES shops(id),
  invoice_no TEXT NOT NULL UNIQUE, customer_id TEXT REFERENCES customers(id),
  branch_id TEXT REFERENCES branches(id), sold_at TIMESTAMPTZ NOT NULL,
  rate_snapshot_id TEXT REFERENCES gold_rates(id), rate_24k_per_g_inr DOUBLE PRECISION,
  subtotal_inr DOUBLE PRECISION NOT NULL, discount_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  tax_inr DOUBLE PRECISION NOT NULL DEFAULT 0, total_inr DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL DEFAULT 'finalized', created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_sold ON sales(sold_at);
CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY, sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id), sku TEXT NOT NULL, name TEXT NOT NULL,
  purity TEXT NOT NULL, net_gold_weight_g DOUBLE PRECISION NOT NULL,
  rate_24k_per_g_inr DOUBLE PRECISION NOT NULL, gold_value_inr DOUBLE PRECISION NOT NULL,
  making_charge_inr DOUBLE PRECISION NOT NULL, stone_value_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  wastage_charge_inr DOUBLE PRECISION NOT NULL DEFAULT 0, other_charges_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  discount_inr DOUBLE PRECISION NOT NULL DEFAULT 0, tax_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  line_total_inr DOUBLE PRECISION NOT NULL, offer_code TEXT
);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY, sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method TEXT NOT NULL, amount_inr DOUBLE PRECISION NOT NULL, reference TEXT,
  status TEXT NOT NULL DEFAULT 'captured', paid_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS returns_refunds (
  id TEXT PRIMARY KEY, sale_id TEXT NOT NULL REFERENCES sales(id),
  sale_item_id TEXT REFERENCES sale_items(id), reason TEXT NOT NULL,
  refund_amount_inr DOUBLE PRECISION NOT NULL, restock INTEGER NOT NULL DEFAULT 1,
  created_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY, shop_id TEXT REFERENCES shops(id), category TEXT NOT NULL,
  amount_inr DOUBLE PRECISION NOT NULL, spent_at TIMESTAMPTZ NOT NULL, note TEXT, created_by TEXT
);
CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY, shop_id TEXT NOT NULL REFERENCES shops(id),
  code TEXT NOT NULL, description TEXT, discount_type TEXT NOT NULL DEFAULT 'flat',
  discount_value DOUBLE PRECISION NOT NULL DEFAULT 0, min_purchase_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  max_discount_inr DOUBLE PRECISION, eligible_categories TEXT DEFAULT '[]',
  valid_from TEXT, valid_to TEXT, redemption_limit INTEGER, redeemed INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1, UNIQUE(shop_id, code)
);
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY, shop_id TEXT NOT NULL REFERENCES shops(id),
  name TEXT NOT NULL, channel TEXT NOT NULL DEFAULT 'whatsapp',
  mode TEXT NOT NULL DEFAULT 'manual', trigger_type TEXT, template TEXT NOT NULL,
  offer_code TEXT, schedule_at TEXT, approval_status TEXT NOT NULL DEFAULT 'draft',
  created_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS campaign_recipients (
  id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'queued', idempotency_key TEXT NOT NULL UNIQUE,
  provider_message_id TEXT, sent_at TIMESTAMPTZ, delivered_at TIMESTAMPTZ, error TEXT
);
CREATE TABLE IF NOT EXISTS consent_events (
  id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id),
  channel TEXT NOT NULL, purpose TEXT NOT NULL DEFAULT 'marketing',
  status TEXT NOT NULL, source TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY, actor_id TEXT, action TEXT NOT NULL,
  entity_type TEXT, entity_id TEXT, summary TEXT, reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
