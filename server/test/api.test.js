const test = require('node:test');
const assert = require('node:assert/strict');
const { before } = require('node:test');

// Postgres-only tests: require DATABASE_URL (or SUPABASE_DB_URL).
// Use a dedicated test database — fixtures are inserted on every run.
if (!process.env.DATABASE_URL && !process.env.SUPABASE_DB_URL) {
  throw new Error('Missing DATABASE_URL for tests. Set it to your Supabase/test Postgres connection string.');
}
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-32chars-minimum-xxxxxx';

const app = require('../src/index');

before(async () => { await app.ready; });

test('health + public catalogue hide costs', async () => {
  const srv = app.listen(0);
  const port = srv.address().port;
  try {
    const h = await fetch(`http://localhost:${port}/api/health`).then(r => r.json());
    assert.equal(h.ok, true);
    const cat = await fetch(`http://localhost:${port}/api/public/products`).then(r => r.json());
    assert.ok(Array.isArray(cat.data));
    if (cat.data.length) {
      assert.equal(cat.data[0].acquisition_cost_inr, undefined, 'costs must not leak to public');
    }
  } finally { srv.close(); }
});

test('auth RBAC: bad login rejected, unauthenticated blocked', async () => {
  const srv = app.listen(0);
  const port = srv.address().port;
  try {
    const bad = await fetch(`http://localhost:${port}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'x@y.z', password: 'no' }) });
    assert.equal(bad.status, 401);
    const blocked = await fetch(`http://localhost:${port}/api/products`);
    assert.equal(blocked.status, 401);
  } finally { srv.close(); }
});
