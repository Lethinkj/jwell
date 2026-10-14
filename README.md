# Gold Jewellery Shop Management System

Web-first boutique platform per `Gold_Jewellery_Shop_Management_System_Documentation_v1_1_Design_System.docx` (v1.0, 14 Oct 2026).

## Architecture

```
apps/web  (React + TS + Vite — public catalogue + admin dashboard)
server    (Node + Express + SQLite — authoritative backend, transactional billing)
packages/pricing    (pure, testable gold-price engine — no UI, no I/O)
packages/validation (shared Zod schemas)
packages/types      (shared TS domain types + API contracts)
supabase/migrations (authoritative Postgres DDL; SQLite adapter mirrors it for local run)
```

Single source of truth: the database. Web and future mobile apps reuse the same
secured APIs. Finalized sales are immutable; corrections use void/return records.
Rates are versioned snapshots — repricing never rewrites history.

## Quick start

```bash
cd gold-shop-platform
npm install
npm run seed -w server   # creates server/data/shop.db + demo users/products/customers/rates
npm run dev              # server :4000 + web :5173
```

Demo logins (seeded): `admin@shop.local / Admin@123` (primary admin),
`billing@shop.local / Billing@123`. Create more billing staff in admin → Staff Management.

## Pricing engine (§7)

Implemented once in `packages/pricing`, used by both `POST /api/pricing/estimate`
and `POST /api/sales/:id/finalize`. Money = integer paise (minor units), never float.
Purity factors: 24K=1.0, 22K=0.916, 18K=0.75, 14K=0.585. See package README + unit tests.

## API (summary, §9)

Auth: `POST /api/auth/login|logout|me` (JWT, httpOnly optional, Bearer supported)
Customers, Categories, Products (+`GET /api/products/barcode/:value`),
Purchases (+`POST /:id/confirm`), Rates (`GET /current`, `POST /override`),
Pricing (`POST /estimate`), Sales (`POST /draft`, `POST /:id/finalize`, `GET /`),
Payments, Returns, Reports (`/sales|/customers|/inventory`), Campaigns (+approve/send),
Messaging webhook, Audit logs. All RBAC-enforced server-side.

## Design system (App. C)

Tokens in `apps/web/src/index.css`: Champagne Gold #C49A52, Deep Gold #8A6428,
Blush #F4DDE3, Rose #8D5668, Ivory #FFF9F2, Espresso #3B302B, Border #E9E1DA,
Muted #746A63, Success/Warning/Error. Cormorant Garamond display + Inter body.
Reduced-motion respected, WCAG AA targets, keyboard/scanner-first billing.

## Production notes

Local run uses SQLite for zero-config pilot. For production, apply
`supabase/migrations/*.sql` to Postgres/Supabase and set `DATABASE_URL`;
the repository layer is isolated in `server/src/db.js` for that swap.
Confirm with owner before go-live: rate provider/benchmark, tax rules (accountant),
making/wastage/stone policy, exchange/old-gold flow, hardware (printer/scanner),
WhatsApp/email provider + consent, branch scope, Windows PWA-vs-installer.
