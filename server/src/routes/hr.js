/**
 * HR management — Phase 1 (admin-only).
 *
 * Covers: employee records, departments/designations, holidays, attendance
 * (manual + biometric import), leave types/balances/requests, salary
 * structures, monthly payroll runs and payslips.
 *
 * Dates are stored/sent as plain 'YYYY-MM-DD' strings so they never shift
 * across timezones. Money is stored as numeric INR amounts; calculations are
 * rounded to 2 decimals before they are persisted.
 */
const express = require('express');
const { get, all, run, withTransaction, uid } = require('../db');
const { auth, requireRoles, audit } = require('../middleware/auth');

const router = express.Router();
router.use(auth);
router.use(requireRoles('admin'));

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_RE = /^\d{4}-\d{2}$/;
const ATT_STATUS = ['present', 'absent', 'half_day', 'leave', 'holiday', 'week_off'];
const EMP_STATUS = ['active', 'notice', 'exited'];
const EMP_TYPES = ['full_time', 'part_time', 'contract', 'trainee'];
const LEAVE_STATUS = ['pending', 'approved', 'rejected', 'cancelled'];
const PAYROLL_STATUS = ['draft', 'locked', 'paid'];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => isoDate(new Date());
const isDate = (v) => typeof v === 'string' && DATE_RE.test(v);
const isPeriod = (v) => typeof v === 'string' && PERIOD_RE.test(v);
const daysInMonth = (period) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const monthBounds = (period) => [`${period}-01`, `${period}-${String(daysInMonth(period)).padStart(2, '0')}`];
const addDays = (date, n) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const inclusiveDays = (from, to) => {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
};
const minutesBetween = (checkIn, checkOut) => {
  if (!checkIn || !checkOut) return 0;
  const [ih, im] = String(checkIn).split(':').map(Number);
  const [oh, om] = String(checkOut).split(':').map(Number);
  if ([ih, im, oh, om].some((v) => !Number.isFinite(v))) return 0;
  let mins = oh * 60 + om - (ih * 60 + im);
  if (mins < 0) mins += 24 * 60; // overnight shift
  return mins;
};

async function findEmployee(shopId, id) {
  return get('SELECT * FROM employees WHERE id = ? AND shop_id = ?', id, shopId);
}

function bad(res, message) {
  return res.status(400).json({ error: 'bad_request', message });
}

// ---------------------------------------------------------------- overview
router.get('/overview', async (req, res) => {
  const shop = req.user.shop_id;
  const month = today().slice(0, 7);
  const [headcount] = await all(
    `SELECT COUNT(*)::int AS total FROM employees WHERE shop_id = ? AND status IN ('active','notice')`, shop);
  const [pending] = await all(
    `SELECT COUNT(*)::int AS total FROM leave_requests WHERE shop_id = ? AND status = 'pending'`, shop);
  const [present] = await all(
    `SELECT COUNT(*)::int AS total FROM attendance WHERE shop_id = ? AND work_date = ? AND status IN ('present','half_day')`,
    shop, today());
  const [pay] = await all(
    `SELECT COALESCE(SUM(net_inr),0) AS net FROM payslips ps
     JOIN payroll_runs pr ON pr.id = ps.payroll_run_id
     WHERE pr.shop_id = ? AND pr.period = ?`, shop, month);
  res.json({
    data: {
      headcount: headcount?.total || 0,
      pending_leaves: pending?.total || 0,
      present_today: present?.total || 0,
      current_month_net: round2(pay?.net || 0),
      month,
    },
  });
});

// ------------------------------------------------------- departments/roles
router.get('/departments', async (req, res) => {
  const rows = await all('SELECT * FROM departments WHERE shop_id = ? ORDER BY name', req.user.shop_id);
  res.json({ data: rows });
});

router.post('/departments', async (req, res) => {
  const name = String((req.body || {}).name || '').trim();
  if (!name) return bad(res, 'name required');
  const exists = await get('SELECT id FROM departments WHERE shop_id = ? AND LOWER(name) = LOWER(?)', req.user.shop_id, name);
  if (exists) return res.status(409).json({ error: 'conflict', message: 'Department already exists' });
  const id = uid('dept');
  await run('INSERT INTO departments (id, shop_id, name) VALUES (?,?,?)', id, req.user.shop_id, name);
  audit(req.user.user_id, 'hr.department.create', 'department', id, name);
  res.status(201).json({ data: await get('SELECT * FROM departments WHERE id = ?', id) });
});

router.delete('/departments/:id', async (req, res) => {
  const row = await get('SELECT * FROM departments WHERE id = ? AND shop_id = ?', req.params.id, req.user.shop_id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const used = await get('SELECT id FROM employees WHERE department_id = ? LIMIT 1', row.id);
  if (used) return res.status(409).json({ error: 'conflict', message: 'Department is assigned to employees' });
  await run('DELETE FROM departments WHERE id = ?', row.id);
  audit(req.user.user_id, 'hr.department.delete', 'department', row.id, row.name);
  res.json({ data: { deleted: true } });
});

router.get('/designations', async (req, res) => {
  const rows = await all('SELECT * FROM designations WHERE shop_id = ? ORDER BY name', req.user.shop_id);
  res.json({ data: rows });
});

router.post('/designations', async (req, res) => {
  const { name, grade } = req.body || {};
  const clean = String(name || '').trim();
  if (!clean) return bad(res, 'name required');
  const exists = await get('SELECT id FROM designations WHERE shop_id = ? AND LOWER(name) = LOWER(?)', req.user.shop_id, clean);
  if (exists) return res.status(409).json({ error: 'conflict', message: 'Designation already exists' });
  const id = uid('desig');
  await run('INSERT INTO designations (id, shop_id, name, grade) VALUES (?,?,?,?)',
    id, req.user.shop_id, clean, grade ? String(grade).trim() : null);
  audit(req.user.user_id, 'hr.designation.create', 'designation', id, clean);
  res.status(201).json({ data: await get('SELECT * FROM designations WHERE id = ?', id) });
});

router.delete('/designations/:id', async (req, res) => {
  const row = await get('SELECT * FROM designations WHERE id = ? AND shop_id = ?', req.params.id, req.user.shop_id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const used = await get('SELECT id FROM employees WHERE designation_id = ? LIMIT 1', row.id);
  if (used) return res.status(409).json({ error: 'conflict', message: 'Designation is assigned to employees' });
  await run('DELETE FROM designations WHERE id = ?', row.id);
  audit(req.user.user_id, 'hr.designation.delete', 'designation', row.id, row.name);
  res.json({ data: { deleted: true } });
});

// Read-only branch lookup for the employee form.
router.get('/branches', async (req, res) => {
  const rows = await all('SELECT id, name, address FROM branches WHERE shop_id = ? AND active = 1 ORDER BY name', req.user.shop_id);
  res.json({ data: rows });
});

// --------------------------------------------------------------- employees
const EMPLOYEE_COLS = [
  'emp_code', 'full_name', 'phone', 'email', 'dob', 'gender', 'address',
  'department_id', 'designation_id', 'branch_id', 'manager_id', 'employment_type',
  'joining_date', 'exit_date', 'status', 'bank_account', 'bank_ifsc', 'pan', 'user_id',
];

router.get('/employees', async (req, res) => {
  const { q, status, department_id } = req.query;
  const conds = ['e.shop_id = ?'];
  const args = [req.user.shop_id];
  if (q) {
    conds.push('(e.full_name LIKE ? OR e.emp_code LIKE ? OR e.phone LIKE ?)');
    const like = `%${q}%`;
    args.push(like, like, like);
  }
  if (status && status !== 'all') { conds.push('e.status = ?'); args.push(status); }
  if (department_id) { conds.push('e.department_id = ?'); args.push(department_id); }
  const rows = await all(
    `SELECT e.*, d.name AS department_name, g.name AS designation_name, b.name AS branch_name,
            m.full_name AS manager_name
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN designations g ON g.id = e.designation_id
     LEFT JOIN branches b ON b.id = e.branch_id
     LEFT JOIN employees m ON m.id = e.manager_id
     WHERE ${conds.join(' AND ')}
     ORDER BY (e.status = 'active') DESC, e.full_name`, ...args);
  res.json({ data: rows });
});

router.get('/employees/:id', async (req, res) => {
  const row = await get(
    `SELECT e.*, d.name AS department_name, g.name AS designation_name, b.name AS branch_name,
            m.full_name AS manager_name
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN designations g ON g.id = e.designation_id
     LEFT JOIN branches b ON b.id = e.branch_id
     LEFT JOIN employees m ON m.id = e.manager_id
     WHERE e.id = ? AND e.shop_id = ?`, req.params.id, req.user.shop_id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const salary = await all(
    'SELECT * FROM salary_structures WHERE employee_id = ? AND shop_id = ? ORDER BY effective_from DESC',
    row.id, req.user.shop_id);
  res.json({ data: { ...row, salary_structures: salary } });
});

router.post('/employees', async (req, res) => {
  const b = req.body || {};
  const empCode = String(b.emp_code || '').trim();
  const fullName = String(b.full_name || '').trim();
  const joiningDate = String(b.joining_date || '').trim();
  if (!empCode || !fullName) return bad(res, 'emp_code and full_name required');
  if (!isDate(joiningDate)) return bad(res, 'joining_date must be YYYY-MM-DD');
  if (b.status && !EMP_STATUS.includes(b.status)) return bad(res, 'invalid status');
  if (b.employment_type && !EMP_TYPES.includes(b.employment_type)) return bad(res, 'invalid employment_type');
  if (b.dob && !isDate(b.dob)) return bad(res, 'dob must be YYYY-MM-DD');
  if (b.exit_date && !isDate(b.exit_date)) return bad(res, 'exit_date must be YYYY-MM-DD');
  const dup = await get('SELECT id FROM employees WHERE shop_id = ? AND LOWER(emp_code) = LOWER(?)', req.user.shop_id, empCode);
  if (dup) return res.status(409).json({ error: 'conflict', message: 'Employee code already exists' });
  if (b.user_id) {
    const profile = await get('SELECT user_id FROM profiles WHERE user_id = ? AND shop_id = ?', b.user_id, req.user.shop_id);
    if (!profile) return bad(res, 'user_id does not belong to this shop');
    const linked = await get('SELECT id FROM employees WHERE user_id = ?', b.user_id);
    if (linked) return res.status(409).json({ error: 'conflict', message: 'Login is already linked to an employee' });
  }
  const id = uid('emp');
  await run(
    `INSERT INTO employees (id, shop_id, user_id, emp_code, full_name, phone, email, dob, gender, address,
       department_id, designation_id, branch_id, manager_id, employment_type, joining_date, exit_date, status,
       bank_account, bank_ifsc, pan)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, req.user.shop_id, b.user_id || null, empCode, fullName, b.phone || null, b.email || null,
    b.dob || null, b.gender || null, b.address || null, b.department_id || null, b.designation_id || null,
    b.branch_id || null, b.manager_id || null, b.employment_type || 'full_time', joiningDate,
    b.exit_date || null, b.status || 'active', b.bank_account || null, b.bank_ifsc || null, b.pan || null);
  audit(req.user.user_id, 'hr.employee.create', 'employee', id, `${empCode} ${fullName}`);
  res.status(201).json({ data: await get('SELECT * FROM employees WHERE id = ?', id) });
});

router.patch('/employees/:id', async (req, res) => {
  const cur = await findEmployee(req.user.shop_id, req.params.id);
  if (!cur) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  if (b.emp_code !== undefined) {
    const code = String(b.emp_code).trim();
    if (!code) return bad(res, 'emp_code cannot be empty');
    const dup = await get('SELECT id FROM employees WHERE shop_id = ? AND LOWER(emp_code) = LOWER(?) AND id <> ?',
      req.user.shop_id, code, cur.id);
    if (dup) return res.status(409).json({ error: 'conflict', message: 'Employee code already exists' });
  }
  for (const k of ['joining_date', 'exit_date', 'dob']) {
    if (b[k] && !isDate(b[k])) return bad(res, `${k} must be YYYY-MM-DD`);
  }
  if (b.status !== undefined && !EMP_STATUS.includes(b.status)) return bad(res, 'invalid status');
  if (b.employment_type !== undefined && !EMP_TYPES.includes(b.employment_type)) return bad(res, 'invalid employment_type');
  if (b.user_id) {
    const profile = await get('SELECT user_id FROM profiles WHERE user_id = ? AND shop_id = ?', b.user_id, req.user.shop_id);
    if (!profile) return bad(res, 'user_id does not belong to this shop');
    const linked = await get('SELECT id FROM employees WHERE user_id = ? AND id <> ?', b.user_id, cur.id);
    if (linked) return res.status(409).json({ error: 'conflict', message: 'Login is already linked to an employee' });
  }
  const sets = [];
  const args = [];
  for (const k of EMPLOYEE_COLS) {
    if (b[k] === undefined) continue;
    let v = b[k];
    if (v === '') v = null;
    if (['department_id', 'designation_id', 'branch_id', 'manager_id', 'user_id', 'exit_date'].includes(k) && v === '') v = null;
    sets.push(`${k} = ?`);
    args.push(v);
  }
  if (!sets.length) return bad(res, 'nothing to update');
  sets.push('updated_at = now()');
  args.push(cur.id);
  await run(`UPDATE employees SET ${sets.join(', ')} WHERE id = ?`, ...args);
  audit(req.user.user_id, 'hr.employee.update', 'employee', cur.id, `updated ${cur.emp_code}`);
  res.json({ data: await get('SELECT * FROM employees WHERE id = ?', cur.id) });
});

// ---------------------------------------------------------------- holidays
router.get('/holidays', async (req, res) => {
  const year = String(req.query.year || today().slice(0, 4));
  if (!/^\d{4}$/.test(year)) return bad(res, 'year must be YYYY');
  const rows = await all(
    'SELECT * FROM holidays WHERE shop_id = ? AND holiday_date LIKE ? ORDER BY holiday_date',
    req.user.shop_id, `${year}-%`);
  res.json({ data: rows });
});

router.post('/holidays', async (req, res) => {
  const { holiday_date, name, holiday_type } = req.body || {};
  if (!isDate(holiday_date)) return bad(res, 'holiday_date must be YYYY-MM-DD');
  if (!String(name || '').trim()) return bad(res, 'name required');
  const id = uid('hol');
  const exists = await get('SELECT id FROM holidays WHERE shop_id = ? AND holiday_date = ?', req.user.shop_id, holiday_date);
  if (exists) return res.status(409).json({ error: 'conflict', message: 'A holiday already exists on that date' });
  await run('INSERT INTO holidays (id, shop_id, holiday_date, name, holiday_type) VALUES (?,?,?,?,?)',
    id, req.user.shop_id, holiday_date, String(name).trim(), holiday_type || 'public');
  audit(req.user.user_id, 'hr.holiday.create', 'holiday', id, `${holiday_date} ${name}`);
  res.status(201).json({ data: await get('SELECT * FROM holidays WHERE id = ?', id) });
});

router.delete('/holidays/:id', async (req, res) => {
  const row = await get('SELECT * FROM holidays WHERE id = ? AND shop_id = ?', req.params.id, req.user.shop_id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  await run('DELETE FROM holidays WHERE id = ?', row.id);
  audit(req.user.user_id, 'hr.holiday.delete', 'holiday', row.id, `${row.holiday_date} ${row.name}`);
  res.json({ data: { deleted: true } });
});

// -------------------------------------------------------------- attendance
router.get('/attendance', async (req, res) => {
  const { month, date, employee_id } = req.query;
  const conds = ['a.shop_id = ?'];
  const args = [req.user.shop_id];
  if (month) {
    if (!isPeriod(month)) return bad(res, 'month must be YYYY-MM');
    const [from, to] = monthBounds(month);
    conds.push('a.work_date BETWEEN ? AND ?');
    args.push(from, to);
  }
  if (date) {
    if (!isDate(date)) return bad(res, 'date must be YYYY-MM-DD');
    conds.push('a.work_date = ?');
    args.push(date);
  }
  if (employee_id) { conds.push('a.employee_id = ?'); args.push(employee_id); }
  const rows = await all(
    `SELECT a.*, e.full_name, e.emp_code, d.name AS department_name
     FROM attendance a
     JOIN employees e ON e.id = a.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE ${conds.join(' AND ')}
     ORDER BY a.work_date DESC, e.full_name`, ...args);
  res.json({ data: rows });
});

async function upsertAttendance(shopId, body, actorId, source) {
  const employeeId = body.employee_id;
  const workDate = body.work_date || body.date;
  if (!employeeId || !isDate(workDate)) {
    throw Object.assign(new Error('employee_id and work_date (YYYY-MM-DD) required'), { status: 400 });
  }
  const emp = await findEmployee(shopId, employeeId);
  if (!emp) throw Object.assign(new Error('employee not found'), { status: 404 });
  const status = body.status || 'present';
  if (!ATT_STATUS.includes(status)) throw Object.assign(new Error('invalid attendance status'), { status: 400 });
  const checkIn = body.check_in || null;
  const checkOut = body.check_out || null;
  if ((checkIn && !/^\d{2}:\d{2}$/.test(checkIn)) || (checkOut && !/^\d{2}:\d{2}$/.test(checkOut))) {
    throw Object.assign(new Error('check_in/check_out must be HH:MM'), { status: 400 });
  }
  const worked = body.worked_minutes !== undefined ? Math.max(0, Math.round(num(body.worked_minutes))) : minutesBetween(checkIn, checkOut);
  const overtime = Math.max(0, Math.round(num(body.overtime_minutes)));
  const id = uid('att');
  const row = await get(
    `INSERT INTO attendance (id, shop_id, employee_id, work_date, check_in, check_out, status,
       worked_minutes, overtime_minutes, source, note, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT (employee_id, work_date) DO UPDATE SET
       check_in = EXCLUDED.check_in, check_out = EXCLUDED.check_out, status = EXCLUDED.status,
       worked_minutes = EXCLUDED.worked_minutes, overtime_minutes = EXCLUDED.overtime_minutes,
       source = EXCLUDED.source, note = EXCLUDED.note, updated_at = now()
     RETURNING *`,
    id, shopId, employeeId, workDate, checkIn, checkOut, status, worked, overtime,
    source || body.source || 'manual', body.note || null, actorId);
  return { row, emp };
}

router.post('/attendance', async (req, res) => {
  try {
    const { row, emp } = await upsertAttendance(req.user.shop_id, req.body || {}, req.user.user_id, 'manual');
    audit(req.user.user_id, 'hr.attendance.mark', 'attendance', row.id, `${emp.emp_code} ${row.work_date} ${row.status}`);
    res.status(201).json({ data: row });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: 'bad_request', message: e.message });
    throw e;
  }
});

/**
 * Biometric import / CSV paste.
 * Body: { source?: 'biometric', rows: [{ emp_code|employee_id, date|work_date,
 *         check_in?, check_out?, status?, overtime_minutes? }] }
 * Unknown employee codes are reported, never silently dropped.
 */
router.post('/attendance/import', async (req, res) => {
  const body = req.body || {};
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return bad(res, 'rows[] required');
  if (rows.length > 5000) return bad(res, 'maximum 5000 rows per import');
  const source = String(body.source || 'biometric');
  const imported = [];
  const errors = [];
  for (let i = 0; i < rows.length; i++) {
    const input = rows[i] || {};
    try {
      let employeeId = input.employee_id;
      if (!employeeId && input.emp_code) {
        const emp = await get('SELECT id FROM employees WHERE shop_id = ? AND LOWER(emp_code) = LOWER(?)',
          req.user.shop_id, String(input.emp_code).trim());
        if (!emp) throw Object.assign(new Error(`unknown employee code: ${input.emp_code}`), { status: 400 });
        employeeId = emp.id;
      }
      const { row } = await upsertAttendance(req.user.shop_id, { ...input, employee_id: employeeId }, req.user.user_id, source);
      imported.push(row);
    } catch (e) {
      errors.push({ row: i + 1, error: e.message });
    }
  }
  audit(req.user.user_id, 'hr.attendance.import', 'attendance', null, `${source}: ${imported.length} imported, ${errors.length} failed`);
  res.json({ data: { imported: imported.length, failed: errors.length, errors, rows: imported } });
});

// -------------------------------------------------------------- leave types
const DEFAULT_LEAVE_TYPES = [
  ['Casual Leave', 12, 1],
  ['Sick Leave', 12, 1],
  ['Earned Leave', 15, 1],
  ['Loss of Pay', 0, 0],
];

async function seedLeaveTypes(shopId) {
  const existing = await get('SELECT id FROM leave_types WHERE shop_id = ? LIMIT 1', shopId);
  if (existing) return;
  for (const [name, quota, paid] of DEFAULT_LEAVE_TYPES) {
    await run('INSERT INTO leave_types (id, shop_id, name, annual_quota, paid) VALUES (?,?,?,?,?)',
      uid('lvt'), shopId, name, quota, paid);
  }
}

router.get('/leave-types', async (req, res) => {
  await seedLeaveTypes(req.user.shop_id);
  const rows = await all('SELECT * FROM leave_types WHERE shop_id = ? ORDER BY name', req.user.shop_id);
  res.json({ data: rows });
});

router.post('/leave-types', async (req, res) => {
  const { name, annual_quota, paid } = req.body || {};
  const clean = String(name || '').trim();
  if (!clean) return bad(res, 'name required');
  const quota = num(annual_quota);
  if (quota < 0) return bad(res, 'annual_quota cannot be negative');
  const exists = await get('SELECT id FROM leave_types WHERE shop_id = ? AND LOWER(name) = LOWER(?)', req.user.shop_id, clean);
  if (exists) return res.status(409).json({ error: 'conflict', message: 'Leave type already exists' });
  const id = uid('lvt');
  await run('INSERT INTO leave_types (id, shop_id, name, annual_quota, paid) VALUES (?,?,?,?,?)',
    id, req.user.shop_id, clean, quota, paid === false || paid === 0 ? 0 : 1);
  audit(req.user.user_id, 'hr.leave_type.create', 'leave_type', id, clean);
  res.status(201).json({ data: await get('SELECT * FROM leave_types WHERE id = ?', id) });
});

async function ensureLeaveBalances(shopId, year, employeeId = null) {
  const types = await all('SELECT * FROM leave_types WHERE shop_id = ? AND active = 1', shopId);
  const employees = employeeId
    ? await all('SELECT id FROM employees WHERE shop_id = ? AND id = ?', shopId, employeeId)
    : await all(`SELECT id FROM employees WHERE shop_id = ? AND status IN ('active','notice')`, shopId);
  for (const e of employees) {
    for (const t of types) {
      await run(
        `INSERT INTO leave_balances (id, shop_id, employee_id, leave_type_id, year, entitled, used)
         VALUES (?,?,?,?,?,?,0) ON CONFLICT (employee_id, leave_type_id, year) DO NOTHING`,
        uid('lvb'), shopId, e.id, t.id, year, num(t.annual_quota));
    }
  }
}

router.get('/leave-balances', async (req, res) => {
  const year = Number(req.query.year || today().slice(0, 4));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return bad(res, 'invalid year');
  const employeeId = req.query.employee_id || null;
  await ensureLeaveBalances(req.user.shop_id, year, employeeId);
  const conds = ['b.shop_id = ?', 'b.year = ?'];
  const args = [req.user.shop_id, year];
  if (employeeId) { conds.push('b.employee_id = ?'); args.push(employeeId); }
  const rows = await all(
    `SELECT b.*, e.full_name, e.emp_code, t.name AS leave_type, t.paid,
            (b.entitled - b.used) AS balance
     FROM leave_balances b
     JOIN employees e ON e.id = b.employee_id
     JOIN leave_types t ON t.id = b.leave_type_id
     WHERE ${conds.join(' AND ')}
     ORDER BY e.full_name, t.name`, ...args);
  res.json({ data: rows.map((r) => ({ ...r, balance: round2(r.balance) })) });
});

// ------------------------------------------------------------ leave requests
router.get('/leaves', async (req, res) => {
  const { status, employee_id, month } = req.query;
  const conds = ['l.shop_id = ?'];
  const args = [req.user.shop_id];
  if (status && status !== 'all') {
    if (!LEAVE_STATUS.includes(status)) return bad(res, 'invalid status');
    conds.push('l.status = ?');
    args.push(status);
  }
  if (employee_id) { conds.push('l.employee_id = ?'); args.push(employee_id); }
  if (month) {
    if (!isPeriod(month)) return bad(res, 'month must be YYYY-MM');
    const [from, to] = monthBounds(month);
    conds.push('NOT (l.to_date < ? OR l.from_date > ?)');
    args.push(from, to);
  }
  const rows = await all(
    `SELECT l.*, e.full_name, e.emp_code, t.name AS leave_type, t.paid
     FROM leave_requests l
     JOIN employees e ON e.id = l.employee_id
     JOIN leave_types t ON t.id = l.leave_type_id
     WHERE ${conds.join(' AND ')}
     ORDER BY (l.status = 'pending') DESC, l.created_at DESC`, ...args);
  res.json({ data: rows });
});

router.post('/leaves', async (req, res) => {
  const { employee_id, leave_type_id, from_date, to_date, reason } = req.body || {};
  if (!employee_id || !leave_type_id) return bad(res, 'employee_id and leave_type_id required');
  if (!isDate(from_date) || !isDate(to_date)) return bad(res, 'from_date and to_date must be YYYY-MM-DD');
  if (to_date < from_date) return bad(res, 'to_date cannot be before from_date');
  const emp = await findEmployee(req.user.shop_id, employee_id);
  if (!emp) return res.status(404).json({ error: 'not_found', message: 'Employee not found' });
  const type = await get('SELECT * FROM leave_types WHERE id = ? AND shop_id = ?', leave_type_id, req.user.shop_id);
  if (!type) return res.status(404).json({ error: 'not_found', message: 'Leave type not found' });
  const span = inclusiveDays(from_date, to_date);
  const requested = (req.body || {}).days !== undefined ? num(req.body.days) : span;
  if (!(requested > 0) || requested > span) return bad(res, 'days must be between 0 and the date range');
  const overlap = await get(
    `SELECT id FROM leave_requests
     WHERE employee_id = ? AND status IN ('pending','approved') AND NOT (to_date < ? OR from_date > ?)`,
    employee_id, from_date, to_date);
  if (overlap) return res.status(409).json({ error: 'conflict', message: 'Overlaps an existing leave request' });
  const year = Number(from_date.slice(0, 4));
  await ensureLeaveBalances(req.user.shop_id, year, employee_id);
  const balance = await get(
    'SELECT * FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?',
    employee_id, leave_type_id, year);
  if (type.paid && balance && num(balance.entitled) > 0 && num(balance.entitled) - num(balance.used) < requested) {
    return res.status(409).json({
      error: 'conflict',
      message: `Insufficient ${type.name} balance (${round2(num(balance.entitled) - num(balance.used))} day(s) left)`,
    });
  }
  const id = uid('lvr');
  await run(
    `INSERT INTO leave_requests (id, shop_id, employee_id, leave_type_id, from_date, to_date, days, reason)
     VALUES (?,?,?,?,?,?,?,?)`,
    id, req.user.shop_id, employee_id, leave_type_id, from_date, to_date, requested, reason || null);
  audit(req.user.user_id, 'hr.leave.create', 'leave_request', id,
    `${emp.emp_code} ${type.name} ${from_date}→${to_date} (${requested}d)`);
  res.status(201).json({ data: await get('SELECT * FROM leave_requests WHERE id = ?', id) });
});

router.post('/leaves/:id/decide', async (req, res) => {
  const { status, note } = req.body || {};
  if (!['approved', 'rejected'].includes(status)) return bad(res, 'status must be approved/rejected');
  const request = await get(
    `SELECT l.*, t.name AS type_name, t.paid FROM leave_requests l
     JOIN leave_types t ON t.id = l.leave_type_id
     WHERE l.id = ? AND l.shop_id = ?`, req.params.id, req.user.shop_id);
  if (!request) return res.status(404).json({ error: 'not_found' });
  if (request.status !== 'pending') return res.status(409).json({ error: 'conflict', message: `Request already ${request.status}` });

  if (status === 'rejected') {
    await run(`UPDATE leave_requests SET status = 'rejected', decided_by = ?, decided_at = now(), decision_note = ? WHERE id = ?`,
      req.user.user_id, note || null, request.id);
    audit(req.user.user_id, 'hr.leave.reject', 'leave_request', request.id, `${request.from_date}→${request.to_date}`);
    return res.json({ data: await get('SELECT * FROM leave_requests WHERE id = ?', request.id) });
  }

  const year = Number(request.from_date.slice(0, 4));
  const result = await withTransaction(async (tx) => {
    const current = await tx.get('SELECT status FROM leave_requests WHERE id = ?', request.id);
    if (!current || current.status !== 'pending') {
      throw Object.assign(new Error('Request is no longer pending'), { status: 409 });
    }
    await tx.run(`UPDATE leave_requests SET status = 'approved', decided_by = ?, decided_at = now(), decision_note = ? WHERE id = ?`,
      req.user.user_id, note || null, request.id);
    await tx.run(
      `INSERT INTO leave_balances (id, shop_id, employee_id, leave_type_id, year, entitled, used)
       VALUES (?,?,?,?,?,0,?)
       ON CONFLICT (employee_id, leave_type_id, year)
       DO UPDATE SET used = leave_balances.used + EXCLUDED.used`,
      uid('lvb'), request.shop_id, request.employee_id, request.leave_type_id, year, num(request.days));
    // Mark the days as leave (never overwrite a manually recorded day).
    let d = request.from_date;
    while (d <= request.to_date) {
      await tx.run(
        `INSERT INTO attendance (id, shop_id, employee_id, work_date, status, source, note, created_by)
         VALUES (?,?,?,?,'leave','leave',?,?)
         ON CONFLICT (employee_id, work_date) DO NOTHING`,
        uid('att'), request.shop_id, request.employee_id, d, `${request.type_name} (approved)`, req.user.user_id);
      d = addDays(d, 1);
    }
    return tx.get('SELECT * FROM leave_requests WHERE id = ?', request.id);
  });
  audit(req.user.user_id, 'hr.leave.approve', 'leave_request', request.id,
    `${request.type_name} ${request.from_date}→${request.to_date} (${request.days}d)`);
  res.json({ data: result });
});

router.post('/leaves/:id/cancel', async (req, res) => {
  const request = await get('SELECT * FROM leave_requests WHERE id = ? AND shop_id = ?', req.params.id, req.user.shop_id);
  if (!request) return res.status(404).json({ error: 'not_found' });
  if (request.status !== 'pending') return res.status(409).json({ error: 'conflict', message: `Request already ${request.status}` });
  await run(`UPDATE leave_requests SET status = 'cancelled', decided_by = ?, decided_at = now() WHERE id = ?`,
    req.user.user_id, request.id);
  audit(req.user.user_id, 'hr.leave.cancel', 'leave_request', request.id, `${request.from_date}→${request.to_date}`);
  res.json({ data: await get('SELECT * FROM leave_requests WHERE id = ?', request.id) });
});

// -------------------------------------------------------- salary structures
const SALARY_FIELDS = [
  'basic_inr', 'hra_inr', 'conveyance_inr', 'special_allowance_inr', 'incentive_inr',
  'pf_inr', 'esi_inr', 'professional_tax_inr', 'tds_inr', 'other_deduction_inr',
];

router.get('/salary', async (req, res) => {
  const conds = ['s.shop_id = ?'];
  const args = [req.user.shop_id];
  if (req.query.employee_id) { conds.push('s.employee_id = ?'); args.push(req.query.employee_id); }
  const rows = await all(
    `SELECT s.*, e.full_name, e.emp_code FROM salary_structures s
     JOIN employees e ON e.id = s.employee_id
     WHERE ${conds.join(' AND ')} ORDER BY e.full_name, s.effective_from DESC`, ...args);
  res.json({ data: rows });
});

router.post('/salary', async (req, res) => {
  const b = req.body || {};
  if (!b.employee_id) return bad(res, 'employee_id required');
  if (!isDate(b.effective_from)) return bad(res, 'effective_from must be YYYY-MM-DD');
  const emp = await findEmployee(req.user.shop_id, b.employee_id);
  if (!emp) return res.status(404).json({ error: 'not_found', message: 'Employee not found' });
  for (const k of SALARY_FIELDS) {
    if (num(b[k]) < 0) return bad(res, `${k} cannot be negative`);
  }
  const existing = await get('SELECT id FROM salary_structures WHERE employee_id = ? AND effective_from = ?',
    emp.id, b.effective_from);
  if (existing) {
    const sets = SALARY_FIELDS.map((k) => `${k} = ?`);
    await run(`UPDATE salary_structures SET ${sets.join(', ')}, active = 1 WHERE id = ?`,
      ...SALARY_FIELDS.map((k) => round2(b[k])), existing.id);
    audit(req.user.user_id, 'hr.salary.update', 'salary_structure', existing.id, `${emp.emp_code} from ${b.effective_from}`);
    return res.json({ data: await get('SELECT * FROM salary_structures WHERE id = ?', existing.id) });
  }
  const id = uid('sal');
  await run(
    `INSERT INTO salary_structures (id, shop_id, employee_id, effective_from, ${SALARY_FIELDS.join(', ')})
     VALUES (?,?,?,?,${SALARY_FIELDS.map(() => '?').join(',')})`,
    id, req.user.shop_id, emp.id, b.effective_from, ...SALARY_FIELDS.map((k) => round2(b[k])));
  audit(req.user.user_id, 'hr.salary.create', 'salary_structure', id, `${emp.emp_code} from ${b.effective_from}`);
  res.status(201).json({ data: await get('SELECT * FROM salary_structures WHERE id = ?', id) });
});

// ----------------------------------------------------------------- payroll
router.get('/payroll', async (req, res) => {
  const rows = await all(
    `SELECT pr.*, COUNT(ps.id)::int AS employee_count,
            COALESCE(SUM(ps.gross_inr),0) AS gross_total,
            COALESCE(SUM(ps.net_inr),0) AS net_total
     FROM payroll_runs pr
     LEFT JOIN payslips ps ON ps.payroll_run_id = pr.id
     WHERE pr.shop_id = ?
     GROUP BY pr.id ORDER BY pr.period DESC`, req.user.shop_id);
  res.json({ data: rows.map((r) => ({ ...r, gross_total: round2(r.gross_total), net_total: round2(r.net_total) })) });
});

router.get('/payroll/:id', async (req, res) => {
  const payroll = await get('SELECT * FROM payroll_runs WHERE id = ? AND shop_id = ?', req.params.id, req.user.shop_id);
  if (!payroll) return res.status(404).json({ error: 'not_found' });
  const slips = await all(
    `SELECT ps.*, e.full_name, e.emp_code, d.name AS department_name
     FROM payslips ps
     JOIN employees e ON e.id = ps.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE ps.payroll_run_id = ? ORDER BY e.full_name`, payroll.id);
  res.json({ data: { ...payroll, payslips: slips } });
});

/**
 * Create or refresh a DRAFT payroll run for a period.
 * A run that is locked/paid is immutable — correct it with an adjustment run.
 */
router.post('/payroll/preview', async (req, res) => {
  const b = req.body || {};
  const period = String(b.period || '');
  if (!isPeriod(period)) return bad(res, 'period must be YYYY-MM');
  const [from, to] = monthBounds(period);
  const workingDays = b.working_days !== undefined ? num(b.working_days) : daysInMonth(period);
  if (workingDays <= 0) return bad(res, 'working_days must be greater than 0');

  let payroll = await get('SELECT * FROM payroll_runs WHERE shop_id = ? AND period = ?', req.user.shop_id, period);
  if (payroll && payroll.status !== 'draft') {
    return res.status(409).json({ error: 'conflict', message: `Payroll for ${period} is ${payroll.status} and cannot be regenerated` });
  }
  if (!payroll) {
    const id = uid('pay');
    await run(`INSERT INTO payroll_runs (id, shop_id, period, working_days, status, created_by)
      VALUES (?,?,?,?,'draft',?)`, id, req.user.shop_id, period, workingDays, req.user.user_id);
    payroll = await get('SELECT * FROM payroll_runs WHERE id = ?', id);
  } else {
    await run('UPDATE payroll_runs SET working_days = ? WHERE id = ?', workingDays, payroll.id);
    await run('DELETE FROM payslips WHERE payroll_run_id = ?', payroll.id);
  }

  const employees = await all(
    `SELECT e.* FROM employees e
     WHERE e.shop_id = ? AND (e.status IN ('active','notice') OR
       (e.exit_date IS NOT NULL AND e.exit_date >= ? AND e.exit_date <= ?))
     ORDER BY e.full_name`, req.user.shop_id, from, to);

  const skipped = [];
  for (const emp of employees) {
    const structure = await get(
      `SELECT * FROM salary_structures
       WHERE employee_id = ? AND shop_id = ? AND active = 1 AND effective_from <= ?
       ORDER BY effective_from DESC LIMIT 1`, emp.id, req.user.shop_id, to);
    if (!structure) {
      skipped.push({ employee_id: emp.id, emp_code: emp.emp_code, full_name: emp.full_name, reason: 'no salary structure' });
      continue;
    }
    const lopAttendance = await all(
      `SELECT work_date, status FROM attendance
       WHERE employee_id = ? AND work_date BETWEEN ? AND ? AND status IN ('absent','half_day')`,
      emp.id, from, to);
    const unpaidLeaves = await all(
      `SELECT l.from_date, l.to_date FROM leave_requests l
       JOIN leave_types t ON t.id = l.leave_type_id
       WHERE l.employee_id = ? AND l.status = 'approved' AND t.paid = 0
         AND NOT (l.to_date < ? OR l.from_date > ?)`, emp.id, from, to);
    // Count unique LOP dates: a day that is both marked absent and covered by
    // unpaid leave must only be deducted once. Half days count as 0.5.
    const lopWeights = new Map();
    for (const r of lopAttendance) {
      const weight = r.status === 'half_day' ? 0.5 : 1;
      lopWeights.set(r.work_date, Math.max(lopWeights.get(r.work_date) || 0, weight));
    }
    for (const l of unpaidLeaves) {
      let d = l.from_date > from ? l.from_date : from;
      const end = l.to_date < to ? l.to_date : to;
      while (d <= end) {
        lopWeights.set(d, Math.max(lopWeights.get(d) || 0, 1));
        d = addDays(d, 1);
      }
    }
    const lopDays = round2([...lopWeights.values()].reduce((sum, w) => sum + w, 0));

    const gross = round2(
      num(structure.basic_inr) + num(structure.hra_inr) + num(structure.conveyance_inr) +
      num(structure.special_allowance_inr) + num(structure.incentive_inr));
    const lopDeduction = round2(Math.min(gross, (gross / workingDays) * lopDays));
    const totalDeductions = round2(
      num(structure.pf_inr) + num(structure.esi_inr) + num(structure.professional_tax_inr) +
      num(structure.tds_inr) + num(structure.other_deduction_inr) + lopDeduction);
    const net = round2(gross - totalDeductions);
    const daysPresent = round2(Math.max(0, workingDays - lopDays));

    await run(
      `INSERT INTO payslips (id, shop_id, payroll_run_id, employee_id, days_present, lop_days,
         basic_inr, hra_inr, conveyance_inr, special_allowance_inr, incentive_inr, gross_inr,
         pf_inr, esi_inr, professional_tax_inr, tds_inr, other_deduction_inr,
         lop_deduction_inr, total_deductions_inr, net_inr)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      uid('slip'), req.user.shop_id, payroll.id, emp.id, daysPresent, lopDays,
      round2(structure.basic_inr), round2(structure.hra_inr), round2(structure.conveyance_inr),
      round2(structure.special_allowance_inr), round2(structure.incentive_inr), gross,
      round2(structure.pf_inr), round2(structure.esi_inr), round2(structure.professional_tax_inr),
      round2(structure.tds_inr), round2(structure.other_deduction_inr),
      lopDeduction, totalDeductions, net);
  }

  audit(req.user.user_id, 'hr.payroll.preview', 'payroll_run', payroll.id, `${period}: ${employees.length - skipped.length} payslip(s)`);
  const slips = await all(
    `SELECT ps.*, e.full_name, e.emp_code FROM payslips ps JOIN employees e ON e.id = ps.employee_id
     WHERE ps.payroll_run_id = ? ORDER BY e.full_name`, payroll.id);
  res.json({ data: { ...payroll, working_days: workingDays, payslips: slips, skipped } });
});

router.post('/payroll/:id/lock', async (req, res) => {
  const payroll = await get('SELECT * FROM payroll_runs WHERE id = ? AND shop_id = ?', req.params.id, req.user.shop_id);
  if (!payroll) return res.status(404).json({ error: 'not_found' });
  if (payroll.status !== 'draft') return res.status(409).json({ error: 'conflict', message: `Payroll is already ${payroll.status}` });
  const [count] = await all('SELECT COUNT(*)::int AS c FROM payslips WHERE payroll_run_id = ?', payroll.id);
  if (!count?.c) return res.status(409).json({ error: 'conflict', message: 'No payslips to lock — preview the payroll first' });
  await run(`UPDATE payroll_runs SET status = 'locked', locked_at = now() WHERE id = ?`, payroll.id);
  audit(req.user.user_id, 'hr.payroll.lock', 'payroll_run', payroll.id, payroll.period);
  res.json({ data: await get('SELECT * FROM payroll_runs WHERE id = ?', payroll.id) });
});

router.post('/payroll/:id/pay', async (req, res) => {
  const payroll = await get('SELECT * FROM payroll_runs WHERE id = ? AND shop_id = ?', req.params.id, req.user.shop_id);
  if (!payroll) return res.status(404).json({ error: 'not_found' });
  if (payroll.status === 'paid') return res.status(409).json({ error: 'conflict', message: 'Payroll is already paid' });
  if (payroll.status !== 'locked') return res.status(409).json({ error: 'conflict', message: 'Lock the payroll before marking it paid' });
  const [totals] = await all(
    `SELECT COALESCE(SUM(net_inr),0) AS net, COUNT(*)::int AS c FROM payslips WHERE payroll_run_id = ?`, payroll.id);
  if (!totals?.c) return res.status(409).json({ error: 'conflict', message: 'No payslips in this run' });
  await withTransaction(async (tx) => {
    await tx.run(`UPDATE payroll_runs SET status = 'paid', paid_at = now() WHERE id = ?`, payroll.id);
    // Post one salary expense so reports/dashboard see the payout exactly once.
    await tx.run(
      `INSERT INTO expenses (id, shop_id, category, amount_inr, spent_at, note, created_by)
       VALUES (?,?,?,?,now(),?,?)`,
      uid('exp'), req.user.shop_id, 'salary', round2(totals.net), `Payroll ${payroll.period}`, req.user.user_id);
  });
  audit(req.user.user_id, 'hr.payroll.pay', 'payroll_run', payroll.id, `${payroll.period}: ${round2(totals.net)} INR`);
  res.json({ data: await get('SELECT * FROM payroll_runs WHERE id = ?', payroll.id) });
});

router.get('/payslips/:id', async (req, res) => {
  const row = await get(
    `SELECT ps.*, e.full_name, e.emp_code, e.phone, e.email, e.joining_date, e.pan,
            e.bank_account, e.bank_ifsc, d.name AS department_name, g.name AS designation_name,
            pr.period, pr.working_days, pr.status AS payroll_status,
            (SELECT name FROM shops WHERE id = ps.shop_id) AS shop_name
     FROM payslips ps
     JOIN employees e ON e.id = ps.employee_id
     JOIN payroll_runs pr ON pr.id = ps.payroll_run_id
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN designations g ON g.id = e.designation_id
     WHERE ps.id = ? AND ps.shop_id = ?`, req.params.id, req.user.shop_id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({ data: row });
});

module.exports = router;
module.exports.ATT_STATUS = ATT_STATUS;
