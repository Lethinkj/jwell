# Supabase (Postgres) setup — 5 minutes

The backend talks to **Supabase Postgres** whenever `DATABASE_URL` is set.
No code or pricing changes are needed — same schema, same queries, same math.

## 1. Create the project
1. Go to https://supabase.com → New project.
2. Save the database password shown at creation time.

## 2. Get the connection string
Project Settings → Database → Connection string → **URI**.
It looks like:
```
postgresql://postgres:<db-password>@db.<project-ref>.supabase.co:5432/postgres
```
Use the **direct connection** (port 5432), not the pooler, for migrate/seed.

## 3. Create the tables (pick one)
- **Option A — SQL Editor (easiest):** open Supabase SQL Editor, paste the full
  contents of `supabase/migrations/0001_init_pg.sql`, Run. Idempotent — safe to re-run.
- **Option B — CLI:**
  ```bash
  cd gold-shop-platform/server
  DATABASE_URL="postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres" npm run migrate
  ```

## 4. Seed demo data (same catalogue, rates, users, offers as local)
```bash
DATABASE_URL="postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres" npm run seed
```
Logins: `owner@shop.local / Owner@123`, `manager / Manager@123`,
`inventory / Inventory@123`, `billing / Billing@123`. Change these in production.

## 5. Point the server at Supabase
```bash
# server/.env  (or environment variables on your host)
DATABASE_URL="postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres"
JWT_SECRET="<32+ random chars>"
PORT=4000
```
```bash
npm run dev -w server   # logs: db: Supabase Postgres
```
`/api/health` reports `"db": "supabase-postgres"` when connected.

## Notes
- `DATABASE_URL` is required — the server is Postgres-only (no SQLite fallback).
- The backend connects with the **service/database role** string, so it bypasses
  RLS — keep the connection string server-side only, never in the web app.
  If you later enable RLS on these tables, add policies for the service role.
- `packages/pricing` is untouched: the same paise-integer engine prices every
  estimate and finalized invoice.
