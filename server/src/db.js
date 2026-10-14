/**
 * Dual-backend data layer.
 * - Supabase Postgres when DATABASE_URL (or SUPABASE_DB_URL) is set (pg Pool, SSL).
 * - Local SQLite (better-sqlite3) otherwise — dev/tests fallback.
 *
 * Same schema, same queries, same results. Async API on both backends:
 *   get(sql, ...params) -> row | undefined
 *   all(sql, ...params) -> rows[]
 *   run(sql, ...params) -> { changes }
 *   withTransaction(async (tx) => ...) — tx has get/all/run on one connection
 * Helpers: nowFn() (current-timestamp SQL), dayExpr(col) (YYYY-MM-DD grouping),
 *   initDb() (idempotent schema), uid(), isPg.
 */
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '';
const isPg = Boolean(DATABASE_URL);

/** Convert `?` placeholders to Postgres `$1, $2, ...`. (No literal `?` in our SQL.) */
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

let pgPool = null;
let sqliteDb = null;

if (isPg) {
  const { Pool, types } = require('pg');
  types.setTypeParser(20, (v) => parseInt(v, 10)); // int8 (COUNT(*)) -> JS int
  types.setTypeParser(1700, (v) => parseFloat(v)); // numeric -> JS number
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Supabase requires SSL
    max: 10,
  });
  pgPool.on('error', (e) => console.error('[db] pg pool error:', e.message));
} else {
  const Database = require('better-sqlite3');
  const DB_FILE = process.env.DATABASE_FILE || path.join(__dirname, '..', 'data', 'shop.db');
  if (DB_FILE !== ':memory:') fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  sqliteDb = new Database(DB_FILE);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');
}

/** Current-timestamp SQL fragment for this backend. */
function nowFn() {
  return isPg ? 'now()' : `datetime('now')`;
}

/** YYYY-MM-DD grouping expression for a timestamp column. */
function dayExpr(col) {
  return isPg ? `to_char(${col},'YYYY-MM-DD')` : `substr(${col},1,10)`;
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
  if (isPg) return (await pgQuery(pgPool, sql, params)).rows[0];
  return sqliteDb.prepare(sql).get(...params);
}

async function all(sql, ...params) {
  if (isPg) return (await pgQuery(pgPool, sql, params)).rows;
  return sqliteDb.prepare(sql).all(...params);
}

async function run(sql, ...params) {
  if (isPg) return { changes: (await pgQuery(pgPool, sql, params)).rowCount };
  return sqliteDb.prepare(sql).run(...params);
}

async function exec(sql) {
  if (isPg) { await pgPool.query(sql); return; }
  sqliteDb.exec(sql);
}

async function withTransaction(fn) {
  if (isPg) {
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
  sqliteDb.exec('BEGIN IMMEDIATE');
  const tx = {
    get: async (sql, ...p) => sqliteDb.prepare(sql).get(...p),
    all: async (sql, ...p) => sqliteDb.prepare(sql).all(...p),
    run: async (sql, ...p) => sqliteDb.prepare(sql).run(...p),
  };
  try {
    const out = await fn(tx);
    sqliteDb.exec('COMMIT');
    return out;
  } catch (e) {
    try { sqliteDb.exec('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  }
}

let _ready = null;
const MIGRATIONS = ['0001_init', '0002_roles_staff'];
const migFile = (m, pg) => fs.readFileSync(
  path.join(__dirname, '..', '..', 'supabase', 'migrations', `${m}${pg ? '_pg' : ''}.sql`), 'utf8');

/** Drop ALTER TABLE ... ADD COLUMN lines whose column already exists (SQLite has no ADD COLUMN IF NOT EXISTS). */
function stripExistingColumns(ddl) {
  const cols = {};
  for (const t of ['profiles', 'customers', 'product_barcodes']) {
    try {
      for (const c of sqliteDb.prepare(`PRAGMA table_info(${t})`).all()) cols[`${t}.${c.name}`] = 1;
    } catch { /* table missing — migration will create/fail loudly */ }
  }
  return ddl.split('\n').filter((line) => {
    const m = line.match(/^\s*ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(\w+)/i);
    return !(m && cols[`${m[1]}.${m[2]}`]);
  }).join('\n');
}

function initDb() {
  if (!_ready) {
    _ready = (async () => {
      if (isPg) {
        await pgPool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
        for (const m of MIGRATIONS) {
          const done = await pgPool.query(`SELECT 1 FROM schema_migrations WHERE name = $1`, [m]);
          if (done.rows.length) continue;
          await pgPool.query(migFile(m, true));
          await pgPool.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [m]);
        }
        console.log('[db] Supabase Postgres schema ready');
      } else {
        sqliteDb.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT)`);
        for (const m of MIGRATIONS) {
          const done = sqliteDb.prepare(`SELECT 1 FROM schema_migrations WHERE name = ?`).get(m);
          if (done) continue;
          sqliteDb.exec(m === '0001_init' ? migFile(m, false) : stripExistingColumns(migFile(m, false)));
          sqliteDb.prepare(`INSERT INTO schema_migrations (name) VALUES (?)`).run(m);
        }
      }
    })();
  }
  return _ready;
}

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

/** Release pooled connections (pg keeps the event loop alive otherwise). */
async function closeDb() {
  if (pgPool) await pgPool.end();
}

module.exports = { get, all, run, exec, withTransaction, nowFn, dayExpr, initDb, uid, isPg, closeDb };
