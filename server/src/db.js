/**
 * Postgres-only data layer (Supabase Postgres via pg Pool, SSL).
 *
 * Requires DATABASE_URL (or SUPABASE_DB_URL). No SQLite fallback.
 *
 * Async API:
 *   get(sql, ...params) -> row | undefined
 *   all(sql, ...params) -> rows[]
 *   run(sql, ...params) -> { changes }
 *   withTransaction(async (tx) => ...) — tx has get/all/run on one connection
 * Helpers: nowFn() (current-timestamp SQL), dayExpr(col) (YYYY-MM-DD grouping),
 *   initDb() (idempotent schema), uid(), isPg (always true, kept for compat).
 */
const fs = require('fs');
const path = require('path');
// Load server/.env first, then repo-root .env as fallback.
// `npm run dev -w server` sets cwd to server/, so plain config() misses the root .env.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '';
if (!DATABASE_URL) {
  throw new Error(
    'Missing DATABASE_URL (or SUPABASE_DB_URL). Postgres-only mode has no SQLite fallback. ' +
      'Set it to your Supabase connection string, e.g. postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres'
  );
}
const isPg = true;

/** Convert `?` placeholders to Postgres `$1, $2, ...`. (No literal `?` in our SQL.) */
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

const { Pool, types } = require('pg');
types.setTypeParser(20, (v) => parseInt(v, 10)); // int8 (COUNT(*)) -> JS int
types.setTypeParser(1700, (v) => parseFloat(v)); // numeric -> JS number
const pgPool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Supabase requires SSL
  max: 10,
});
pgPool.on('error', (e) => console.error('[db] pg pool error:', e.message));

/** Current-timestamp SQL fragment. */
function nowFn() {
  return 'now()';
}

/** YYYY-MM-DD grouping expression for a timestamp column. */
function dayExpr(col) {
  return `to_char(${col},'YYYY-MM-DD')`;
}

async function pgQuery(client, sql, params) {
  try {
    return await client.query(toPg(sql), params);
  } catch (e) {
    // Normalize unique violations so existing 409 handlers keep working.
    if (e && e.code === '23505') throw new Error(`UNIQUE constraint failed: ${e.detail || e.message}`);
    throw e;
  }
}

async function get(sql, ...params) {
  return (await pgQuery(pgPool, sql, params)).rows[0];
}

async function all(sql, ...params) {
  return (await pgQuery(pgPool, sql, params)).rows;
}

async function run(sql, ...params) {
  return { changes: (await pgQuery(pgPool, sql, params)).rowCount };
}

async function exec(sql) {
  await pgPool.query(sql);
}

async function withTransaction(fn) {
  const client = await pgPool.connect();
  const tx = {
    get: async (sql, ...p) => (await pgQuery(client, sql, p)).rows[0],
    all: async (sql, ...p) => (await pgQuery(client, sql, p)).rows,
    run: async (sql, ...p) => ({ changes: (await pgQuery(client, sql, p)).rowCount }),
  };
  try {
    await client.query('BEGIN');
    const out = await fn(tx);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  } finally {
    client.release();
  }
}

let _ready = null;
const MIGRATIONS = ['0001_init', '0002_roles_staff', '0003_offers_created_at', '0004_email_settings', '0005_occasions_festivals', '0006_campaign_schedule'];
const migFile = (m) => fs.readFileSync(
  path.join(__dirname, '..', '..', 'supabase', 'migrations', `${m}_pg.sql`), 'utf8');

function initDb() {
  if (!_ready) {
    _ready = (async () => {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');
        // Serialize migrations across processes (e.g. parallel test files or
        // several app replicas booting at once). Concurrent `CREATE TABLE IF
        // NOT EXISTS` otherwise races and fails with a duplicate pg_type error.
        await client.query('SELECT pg_advisory_xact_lock($1)', [727001]);
        await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
        for (const m of MIGRATIONS) {
          const done = await client.query(`SELECT 1 FROM schema_migrations WHERE name = $1`, [m]);
          if (done.rows.length) continue;
          await client.query(migFile(m));
          await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [m]);
        }
        await client.query('COMMIT');
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch { /* ignore */ }
        _ready = null; // allow a retry on the next require/boot
        throw e;
      } finally {
        client.release();
      }
      console.log('[db] Supabase Postgres schema ready');
    })();
  }
  return _ready;
}

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

/** Release pooled connections (pg keeps the event loop alive otherwise). */
async function closeDb() {
  await pgPool.end();
}

module.exports = { get, all, run, exec, withTransaction, nowFn, dayExpr, initDb, uid, isPg, closeDb };
