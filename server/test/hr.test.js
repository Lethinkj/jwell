const test = require('node:test');
const assert = require('node:assert/strict');
const { before, after } = require('node:test');
const bcrypt = require('bcryptjs');

if (!process.env.DATABASE_URL && !process.env.SUPABASE_DB_URL) {
  throw new Error('Missing DATABASE_URL for tests. Set it to your Supabase/test Postgres connection string.');
}
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-32chars-minimum-xxxxxx';
process.env.MAIL_DISABLED = 'true';

const app = require('../src/index');
const { get, run, uid } = require('../src/db');

let base = '';
let adminTok = '';
let billTok = '';
let shopId = '';
let empId = '';
let deptId = '';
let period = '';
let payrollId = '';
const runId = Date.now().toString(36);
const adminEmail = `hradmin_${runId}@test.local`;
const billEmail = `hrbill_${runId}@test.local`;

async function api(method, path, token, body) {
  const r = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, body: j };
}

const daysInMonth = (p) => { const [y, m] = p.split('-').map(Number); return new Date(y, m, 0).getDate(); };

before(async () => {
  await app.ready;
  shopId = uid('shop');
  await run('INSERT INTO shops (id, name) VALUES (?,?)', shopId, 'HR Test Shop');
  const mk = async (email, role, pass, primary) => {
    const id = uid('usr');
    await run(`INSERT INTO profiles (user_id, shop_id, role, display_name, email, password_hash, active, is_primary)
      VALUES (?,?,?,?,?,?,1,?)`, id, shopId, role, email, email, bcrypt.hashSync(pass, 10), primary ? 1 : 0);
  };
  await mk(adminEmail, 'admin', 'Admin@1234', true);
  await mk(billEmail, 'billing', 'Bill@1234', false);

  const srv = app.listen(0);
  base = `http://localhost:${srv.address().port}/api`;
  globalThis.__hrSrv = srv;
  const a = await api('POST', '/auth/login', null, { email: adminEmail, password: 'Admin@1234' });
  assert.equal(a.status, 200);
  adminTok = a.body.token;
  const b = await api('POST', '/auth/login', null, { email: billEmail, password: 'Bill@1234' });
  assert.equal(b.status, 200);
  billTok = b.body.token;
  period = new Date().toISOString().slice(0, 7);
});

test('HR is admin-only', async () => {
  for (const [m, p, body] of [
    ['GET', '/hr/employees', null],
    ['GET', '/hr/leave-balances', null],
    ['GET', '/hr/payroll', null],
    ['POST', '/hr/employees', { emp_code: 'X', full_name: 'X', joining_date: '2026-01-01' }],
  ]) {
    const r = await api(m, p, billTok, body);
    assert.ok([401, 403].includes(r.status), `${m} ${p} should be blocked for billing, got ${r.status}`);
  }
});

test('employee, department and designation records', async () => {
  const d = await api('POST', '/hr/departments', adminTok, { name: `Sales ${runId}` });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  deptId = d.body.data.id;
  const g = await api('POST', '/hr/designations', adminTok, { name: `Executive ${runId}` });
  assert.equal(g.status, 201);

  const e = await api('POST', '/hr/employees', adminTok, {
    emp_code: `EMP-${runId}`, full_name: 'Test Employee', phone: '9000000000',
    joining_date: '2026-01-01', department_id: deptId, designation_id: g.body.data.id,
  });
  assert.equal(e.status, 201, JSON.stringify(e.body));
  empId = e.body.data.id;
  assert.equal(e.body.data.status, 'active');

  const dup = await api('POST', '/hr/employees', adminTok, {
    emp_code: `emp-${runId}`, full_name: 'Duplicate', joining_date: '2026-01-01',
  });
  assert.equal(dup.status, 409);

  const list = await api('GET', `/hr/employees?q=Test%20Employee`, adminTok);
  assert.ok(list.body.data.some((row) => row.id === empId && row.department_name.startsWith('Sales')));
});

test('attendance: manual mark and biometric import upsert', async () => {
  const date = `${period}-01`;
  const m = await api('POST', '/hr/attendance', adminTok, {
    employee_id: empId, work_date: date, status: 'absent',
  });
  assert.equal(m.status, 201, JSON.stringify(m.body));
  assert.equal(m.body.data.status, 'absent');

  const imp = await api('POST', '/hr/attendance/import', adminTok, {
    source: 'biometric',
    rows: [
      { emp_code: `EMP-${runId}`, date, check_in: '10:05', check_out: '19:10', status: 'present' },
      { emp_code: `NOPE-${runId}`, date, status: 'present' },
    ],
  });
  assert.equal(imp.status, 200);
  assert.equal(imp.body.data.imported, 1);
  assert.equal(imp.body.data.failed, 1);

  const rows = await api('GET', `/hr/attendance?month=${period}&employee_id=${empId}`, adminTok);
  const row = rows.body.data.find((r) => r.work_date === date);
  assert.equal(row.status, 'present');
  assert.equal(row.source, 'biometric');
  assert.equal(row.worked_minutes, 545); // 10:05 -> 19:10, overnight-safe
});

test('leave: apply, approve, balance consumed; unpaid leave is accepted', async () => {
  const types = await api('GET', '/hr/leave-types', adminTok);
  assert.ok(types.body.data.length >= 4, 'default leave types are seeded');

  const unpaid = types.body.data.find((t) => t.name === 'Loss of Pay');
  const from = `${period}-05`;
  const to = `${period}-06`;
  const apply = await api('POST', '/hr/leaves', adminTok, {
    employee_id: empId, leave_type_id: unpaid.id, from_date: from, to_date: to, days: 2, reason: 'test',
  });
  assert.equal(apply.status, 201, JSON.stringify(apply.body));

  const overlap = await api('POST', '/hr/leaves', adminTok, {
    employee_id: empId, leave_type_id: unpaid.id, from_date: to, to_date: to, days: 1,
  });
  assert.equal(overlap.status, 409);

  const approve = await api('POST', `/hr/leaves/${apply.body.data.id}/decide`, adminTok, { status: 'approved' });
  assert.equal(approve.status, 200, JSON.stringify(approve.body));
  const again = await api('POST', `/hr/leaves/${apply.body.data.id}/decide`, adminTok, { status: 'approved' });
  assert.equal(again.status, 409);

  const balances = await api('GET', `/hr/leave-balances?year=${period.slice(0, 4)}&employee_id=${empId}`, adminTok);
  const b = balances.body.data.find((x) => x.leave_type_id === unpaid.id);
  assert.equal(b.used, 2);
  assert.ok(b.balance <= 0, 'LOP has no annual entitlement');

  const att = await api('GET', `/hr/attendance?month=${period}&employee_id=${empId}`, adminTok);
  assert.ok(att.body.data.filter((r) => r.status === 'leave').length >= 2, 'approved leave marks attendance days');
});

test('payroll: LOP deduction, lock, pay and expense posting', async () => {
  const sal = await api('POST', '/hr/salary', adminTok, {
    employee_id: empId, effective_from: `${period}-01`,
    basic_inr: 30000, hra_inr: 10000, pf_inr: 0,
  });
  assert.equal(sal.status, 201, JSON.stringify(sal.body));

  // LOP union test: day 3 is plain absent, days 5–6 are approved unpaid leave,
  // and day 5 is *also* marked absent — the day must still only be counted once.
  await api('POST', '/hr/attendance', adminTok, { employee_id: empId, work_date: `${period}-03`, status: 'absent' });
  await api('POST', '/hr/attendance', adminTok, { employee_id: empId, work_date: `${period}-05`, status: 'absent' });

  const preview = await api('POST', '/hr/payroll/preview', adminTok, { period });
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  payrollId = preview.body.data.id;
  const slip = preview.body.data.payslips.find((p) => p.employee_id === empId);
  assert.ok(slip, 'employee with a salary structure gets a payslip');
  const dim = daysInMonth(period);
  const expectedLop = Math.round((40000 / dim) * 3 * 100) / 100; // 1 absent + 2 unpaid leave days
  assert.equal(slip.lop_days, 3);
  assert.equal(slip.gross_inr, 40000);
  assert.equal(slip.lop_deduction_inr, expectedLop);
  assert.equal(slip.net_inr, Math.round((40000 - expectedLop) * 100) / 100);

  const lock = await api('POST', `/hr/payroll/${payrollId}/lock`, adminTok, {});
  assert.equal(lock.status, 200);
  const regen = await api('POST', '/hr/payroll/preview', adminTok, { period });
  assert.equal(regen.status, 409, 'locked payroll cannot be regenerated');

  const before = await api('GET', `/hr/payroll/${payrollId}`, adminTok);
  assert.equal(before.body.data.status, 'locked');
  const pay = await api('POST', `/hr/payroll/${payrollId}/pay`, adminTok, {});
  assert.equal(pay.status, 200, JSON.stringify(pay.body));
  const afterPay = await api('GET', `/hr/payroll/${payrollId}`, adminTok);
  assert.equal(afterPay.body.data.status, 'paid');

  const exp = await get(`SELECT * FROM expenses WHERE shop_id=? AND category='salary' AND note=?`, shopId, `Payroll ${period}`);
  assert.ok(exp, 'salary expense is posted once when payroll is marked paid');
  assert.equal(Number(exp.amount_inr), Number(slip.net_inr));

  const slipRes = await api('GET', `/hr/payslips/${slip.id}`, adminTok);
  assert.equal(slipRes.status, 200);
  assert.equal(slipRes.body.data.full_name, 'Test Employee');
  assert.ok(slipRes.body.data.shop_name, 'payslip carries the shop name for the PDF');
});

test('overview returns HR counters', async () => {
  const r = await api('GET', '/hr/overview', adminTok);
  assert.equal(r.status, 200);
  assert.equal(r.body.data.headcount, 1);
  assert.equal(r.body.data.month, period);
});

test('close server', async () => { globalThis.__hrSrv.close(); });

after(async () => {
  if (!shopId) return;
  const cleanup = [
    `DELETE FROM payslips WHERE shop_id = ?`,
    `DELETE FROM payroll_runs WHERE shop_id = ?`,
    `DELETE FROM leave_requests WHERE shop_id = ?`,
    `DELETE FROM leave_balances WHERE shop_id = ?`,
    `DELETE FROM attendance WHERE shop_id = ?`,
    `DELETE FROM salary_structures WHERE shop_id = ?`,
    `DELETE FROM holidays WHERE shop_id = ?`,
    `DELETE FROM leave_types WHERE shop_id = ?`,
    `DELETE FROM employees WHERE shop_id = ?`,
    `DELETE FROM departments WHERE shop_id = ?`,
    `DELETE FROM designations WHERE shop_id = ?`,
    `DELETE FROM expenses WHERE shop_id = ?`,
    `DELETE FROM audit_logs WHERE actor_id IN (SELECT user_id FROM profiles WHERE shop_id = ?)`,
    `DELETE FROM profiles WHERE shop_id = ?`,
    `DELETE FROM shops WHERE id = ?`,
  ];
  for (const sql of cleanup) {
    try { await run(sql, shopId); } catch { /* best effort */ }
  }
});
