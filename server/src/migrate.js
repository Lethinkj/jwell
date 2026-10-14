// Applies Supabase (Postgres) migrations in order, tracked in schema_migrations.
// Usage:
//   DATABASE_URL="postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres" npm run migrate -w server
require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function main() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error('Set DATABASE_URL to your Supabase connection string first. See docs/supabase.md');
    process.exit(1);
  }
  const { Client } = require('pg');
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const dir = path.join(__dirname, '..', '..', 'supabase', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('_pg.sql')).sort();
  if (!files.length) { console.error('No *_pg.sql migrations found'); process.exit(1); }
  for (const f of files) {
    const name = f.replace(/_pg\.sql$/, '');
    const done = await client.query(`SELECT 1 FROM schema_migrations WHERE name = $1`, [name]);
    if (done.rows.length) { console.log('[migrate] skip (applied):', f); continue; }
    console.log('[migrate]', f);
    await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
    await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [name]);
  }
  await client.end();
  console.log('[migrate] done');
}
main().catch((e) => { console.error('[migrate] failed:', e.message); process.exit(1); });
