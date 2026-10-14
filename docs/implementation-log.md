# Implementation Log — Gold Jewellery Shop Management System

**Source requirements:** `Gold_Jewellery_Shop_Management_System_Documentation_v1_1_Design_System.docx` (v1.0, 14 Oct 2026)
**Workspace:** `gold-shop-platform/` **Date:** 14 Oct 2026
**Scope note:** pricing data and formulas were frozen throughout — only infrastructure/data-layer work after the initial build.

---

## 1. Requirements analysis (§1–§19 + Appendices)

Parsed the `.docx` (788 text runs) into buildable scope:

| Area | What the doc demands |
|---|---|
| Platform | Web-first: public catalogue + admin dashboard; future mobile/PWA reuse the same backend |
| Source of truth | One shared backend + one database; no duplicated products/rates/sales |
| Pricing (§7) | `gold = net_wt × 24K-rate × purity_factor`; making = % / per-gram / fixed; paise-integer money, never float; invoices immutable snapshots |
| Billing (§5.5/§6.2) | Barcode → estimate → finalize **atomically**; two staff can't sell one piece; voids/returns as audit records, never edits |
| Rates (§5.6) | Versioned snapshots, source + timestamp, stale policy, audited manual override |
| CRM/Campaigns (§5.4/§5.7/§12) | Consent-checked, idempotent sends, manual approval gate |
| Reports (§10) | One definition per KPI; presets Today/Week/Month/3M/6M/1Y + Custom |
| Design (App. C) | Champagne Gold `#C49A52`, Blush `#F4DDE3`, Ivory `#FFF9F2`, Espresso `#3B302B`; Cormorant Garamond + Inter; reduced-motion; scanner-first billing |

---

## 2. What was built

```
gold-shop-platform/
├── apps/web/               # React + TS + Vite (public site + admin dashboard)
│   └── src/
│       ├── App.tsx         # routing, public nav + rate pill, AdminShell
│       ├── pages/          # Landing, Catalogue, ProductDetail, Login
│       └── pages/admin/    # Dashboard, Billing, Inventory, Customers, Rates, Campaigns, Reports
├── server/                 # Node + Express API (authoritative backend)
│   └── src/
│       ├── db.js           # dual-backend data layer (Supabase Postgres ↔ SQLite)
│       ├── index.js        # app, public routes, boot/migrate-on-start
│       ├── seed.js         # demo users/catalogue/rates/offers (works on both DBs)
│       ├── migrate.js      # applies *_pg.sql migrations to Supabase
│       ├── middleware/auth.js  # JWT auth, RBAC, audit
│       ├── services/rates.js   # provider adapter, normalization, freshness
│       ├── services/pricing.js # thin wrapper over @gold-shop/pricing
│       └── routes/         # auth, catalog, ops (rates/pricing/purchases), sales, crm
├── packages/
│   ├── pricing/            # PURE §7 engine (paise-integer) + 6 unit tests — untouched since day one
│   ├── validation/         # shared Zod schemas
│   └── types/              # shared domain types
├── supabase/migrations/
│   ├── 0001_init.sql       # SQLite/local DDL
│   └── 0001_init_pg.sql    # Supabase Postgres DDL (timestamptz, same 24 tables)
└── docs/                   # operations.md, supabase.md, this file
```

### Backend API (§9) — all RBAC-enforced server-side
Auth (`login/me/logout`) · Categories · Products (+`GET /products/barcode/:value`) ·
Suppliers/Purchases (+confirm intake txn) · Rates (`current`, `refresh`, `override`) ·
`POST /pricing/estimate` (never final) · Sales (`draft` reserve → `finalize` atomic → `void`) ·
Customers/occasions/consent · Offers/Campaigns (`create → approve → send`, idempotent) ·
Messaging webhook · Reports (`sales/inventory/customers`) · Audit logs · Public catalogue
(costs/notes never exposed) · `/api/health` reports active backend (`supabase-postgres`/`sqlite`).

### Frontend
Public landing (hero, featured, collections, pricing explainer), filterable catalogue,
product detail with rate-stamped estimate, staff login; admin Overview (KPIs + Recharts
trend/payment mix, shared presets), scanner-first Billing (HID scanners type + Enter,
duplicates suppressed, sold/unknown blocked), Inventory CRUD, CRM with combined filters +
purchase/consent history, Rates (refresh/override + history), Campaigns (queue → approve →
send), Reports + CSV export.

---

## 3. Supabase Postgres enablement (main infrastructure change)

**Goal:** run the same backend on Supabase Postgres; zero pricing/logic changes.

1. **New `server/src/db.js`** — dual backend, one async API (`get/all/run/withTransaction`):
   - `DATABASE_URL`/`SUPABASE_DB_URL` set → `pg` Pool + SSL (Supabase).
   - unset → better-sqlite3 (local dev/tests fallback).
   - `?` → `$n` placeholder conversion; `23505` → `UNIQUE` error normalization (keeps 409 handlers);
     int8/numeric type parsers so `COUNT(*)` stays a JS number; `nowFn()` / `dayExpr()` SQL helpers.
2. **`supabase/migrations/0001_init_pg.sql`** — same 24 tables/columns as SQLite DDL, Postgres-native timestamps.
3. **`server/src/migrate.js`** (`npm run migrate`) — applies `*_pg.sql` to Supabase; server also self-applies schema idempotently on boot.
4. **Converted 11 files sync → async** (`index/seed/auth-middleware/rates-service/all 5 route files/test`) with identical logic; only Postgres-compat SQL fixes (`datetime('now')`, `substr` on timestamps, `HAVING alias`).
5. **`server/.env`** — holds `DATABASE_URL`; `.env.example` + **`docs/supabase.md`** (5-min setup guide) added.
6. **Verified live:** connected to `db.wqpgystsqtccxhoxdkpr.supabase.co`, all 24 tables present; seed + full E2E sale on Supabase path.

## 4. Bugs found & fixed along the way
- `middleware/auth.js` required `./db` (wrong path) → audit inserts silently never ran (swallowed by try/catch). Fixed to `../db`; audit logs now write.
- `/api/health` mounted after an authenticated router → returned 401. Moved before auth routes.
- React `AdminShell` called `navigate()` during render → "Cannot update BrowserRouter" warning. Replaced with `<Navigate>` + auth `loading` state.
- Server `listen()` had no error handler → port conflicts exited silently. Added clear `EADDRINUSE` message (`lsof -ti:4000 | xargs kill -9` to clear).
- Local-only `.env` confusion: `npm run -w server` resolves env from `server/`; documented.

## 5. Verification results
- `@gold-shop/pricing`: **6/6 pass** (purity factors, 24K normalization, §7.2 worked example, making modes, discount clamp, snapshot stability).
- `server` API tests: **2/2 pass** (public cost-leak check, auth/RBAC blocks).
- Web `tsc + vite build`: **passes**.
- E2E sale (barcode → estimate → draft → finalize → reports): invoice total **₹63,298.30**, reports reconcile (revenue/bills/items/gold) — **byte-identical before and after the Supabase swap**, proving pricing untouched.

## 6. Run / credentials
```bash
cd gold-shop-platform
npm install
npm run migrate -w server   # Supabase once (or paste 0001_init_pg.sql in SQL Editor)
npm run seed -w server      # demo data (detects DATABASE_URL automatically)
npm run dev                 # API :4000 + web :5173
```
| Role | Email | Password |
|---|---|---|
| Owner | `owner@shop.local` | `Owner@123` |
| Manager | `manager@shop.local` | `Manager@123` |
| Inventory | `inventory@shop.local` | `Inventory@123` |
| Billing | `billing@shop.local` | `Billing@123` |

## 7. Phase 2 — roles, staff, phone-first CRM, barcodes, camera scan (this session)

Prompt scope implemented without touching `packages/pricing` (6/6 tests still pass, formulas byte-identical).

**Database — migration `0002_roles_staff(.sql/_pg.sql)`**, tracked in new `schema_migrations` table (both backends; `migrate.js` skips applied):
- `profiles`: `+ phone, last_login_at, is_primary`; legacy roles remapped (`owner→admin`, all others→`billing`); oldest admin per shop flagged primary.
- `customers`: `+ normalized_phone` (indexed, non-unique) + backfilled; shared numbers stay separate, never auto-merged.
- `product_barcodes`: `+ shop_id` (global UNIQUE kept) + backfilled + scoped index.
- New `shop_settings` table (shop/invoice/label/app settings).

**Backend (new/changed):**
- All `requireRoles` collapsed to `admin` / `admin+billing`; reports + audit-logs admin-only; billing sales history scoped to own bills (`created_by`); customer purchase lists finalized-only.
- New `routes/admin.js`: staff list/create (role forced `billing`, single-primary-admin guards, no self-deactivation), one-time password reset (rate-limited, bcrypt, audited), per-staff activity, settings GET/PUT (allowlisted keys, audited).
- `services/phone.js`: normalization (+91/trunk-0 handling) used by create, inline billing create, and search.
- `GET /customers/phone/:phone` (all normalized variants match + finalized-bill summaries); list filters `last_days / lapsed_days / repeat / last_from-last_to` computed over finalized sales only.
- `POST /products/:id/barcode` (duplicate→409 unless explicit `confirm:true`; reassign audited), `GET /products/:id/label` (label dims + optional server-computed price only when `label_show_price=yes`).
- Login rate-limited (20/15 min), `last_login_at` tracked; deactivation revokes sessions immediately (auth re-checks `active` per request).
- `seed.js`: `admin@shop.local` (primary) + `billing@shop.local`, settings defaults, phone backfill.

**Frontend (new/changed):** role-based nav + `RequireAdmin` route guard; pages **Staff**, **Barcode Generator** (A: multi-piece create→labels, B: search/batch/copies/regenerate, scanner test), **Settings**, **Audit Logs**; **Billing** rebuilt phone-first (lookup/register/shared-number pick) with camera `ScannerModal` (@zxing reader, rear-preferred, 2.5 s dedupe, track cleanup, HTTPS warning) alongside HID/manual; scoped invoice history; **Customers** recency filters; print stylesheet (labels only); `bwip-js` Code-128 rendering (DB value is the identifier).

**Verification (all executed):** pricing 6/6 · server 10/10 (new `roles.test.js`: 403-matrix, single-admin, revocation, reset, phone variants, barcode confirm/audit, atomic finalize + snapshot + void split) · `tsc + vite build` clean · scripted E2E **SQLite: ALL PASS** and **Supabase-PG: ALL PASS** (create→barcode→label→scan→phone→finalize→history→filters→staff→settings→audit→void), pg `to_char` reports path included. All E2E traces deleted from live Supabase after verification (0 sales, seeded catalogue intact).

## 8. Open items / next steps (per §18)
Confirm before production: rate provider/benchmark, tax rules (accountant), making/wastage/stone policy,
exchange/old-gold flow, printer/scanner hardware, WhatsApp/email provider + consent wording, single vs
multi-branch, PWA vs Windows installer. Rotate the shared DB password (it passed through chat) and set a
strong `JWT_SECRET` in production. Change seeded staff passwords on go-live.
