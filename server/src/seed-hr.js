/**
 * HR demo data — employees, departments, designations, holidays, leave,
 * attendance and two payroll runs (previous month paid, current month draft).
 *
 * Idempotent: if the shop already has employees this whole section is skipped.
 * Called by `seed.js` and `seed-demo.js` after the shop/users exist.
 */
const { get, all, run, uid } = require('./db');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const periodOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

const DEPARTMENTS = ['Sales', 'Billing', 'Inventory', 'Workshop', 'Accounts'];
const DESIGNATIONS = [
  ['Store Manager', 'M1'], ['Sales Executive', 'E2'], ['Billing Executive', 'E2'],
  ['Inventory Coordinator', 'E2'], ['Senior Goldsmith', 'S1'], ['Accounts Executive', 'E2'],
];

const STAFF = [
  {
    code: 'EMP-001', name: 'Rajesh Nair', dept: 'Sales', desig: 'Store Manager', type: 'full_time',
    join: '2019-04-01', status: 'active', phone: '+91 98450 10001', email: 'rajesh.nair@shop.local',
    pan: 'ABCPN1234F', bank: '50100234567891', ifsc: 'HDFC0001234',
    salary: { basic: 45000, hra: 18000, conv: 3000, special: 6000, incentive: 5000, pf: 1800, pt: 200, tds: 3000 },
  },
  {
    code: 'EMP-002', name: 'Priya Desai', dept: 'Sales', desig: 'Sales Executive', type: 'full_time',
    join: '2021-06-15', status: 'active', phone: '+91 98450 10002', email: 'priya.desai@shop.local',
    pan: 'ABCPD2345G', bank: '50100234567892', ifsc: 'ICIC0004567',
    salary: { basic: 25000, hra: 10000, conv: 2000, special: 3000, incentive: 4000, pf: 1800, pt: 200, tds: 0 },
  },
  {
    code: 'EMP-003', name: 'Amit Joshi', dept: 'Billing', desig: 'Billing Executive', type: 'full_time',
    join: '2022-02-01', status: 'active', phone: '+91 98450 10003', email: 'amit.joshi@shop.local',
    pan: 'ABCJA3456H', bank: '50100234567893', ifsc: 'SBIN0007890',
    salary: { basic: 22000, hra: 8800, conv: 2000, special: 2000, incentive: 2500, pf: 1800, pt: 200, tds: 0 },
  },
  {
    code: 'EMP-004', name: 'Lakshmi Iyer', dept: 'Inventory', desig: 'Inventory Coordinator', type: 'full_time',
    join: '2020-09-10', status: 'active', phone: '+91 98450 10004', email: 'lakshmi.iyer@shop.local',
    pan: 'ABCLI4567J', bank: '50100234567894', ifsc: 'AXIS0002345',
    salary: { basic: 24000, hra: 9600, conv: 2000, special: 2500, incentive: 2000, pf: 1800, pt: 200, tds: 0 },
  },
  {
    code: 'EMP-005', name: 'Suresh Kumar', dept: 'Workshop', desig: 'Senior Goldsmith', type: 'contract',
    join: '2018-11-05', status: 'active', phone: '+91 98450 10005', email: 'suresh.kumar@shop.local',
    pan: 'ABCKS5678K', bank: '50100234567895', ifsc: 'HDFC0005678',
    salary: { basic: 30000, hra: 0, conv: 0, special: 5000, incentive: 0, pf: 0, pt: 0, tds: 0 },
  },
  {
    code: 'EMP-006', name: 'Neha Gupta', dept: 'Sales', desig: 'Sales Executive', type: 'full_time',
    join: '2023-07-20', status: 'notice', phone: '+91 98450 10006', email: 'neha.gupta@shop.local',
    pan: 'ABCNG6789L', bank: '50100234567896', ifsc: 'KKBK0003456',
    salary: { basic: 23000, hra: 9200, conv: 2000, special: 2000, incentive: 3000, pf: 1800, pt: 200, tds: 0 },
  },
  {
    code: 'EMP-007', name: 'Vikram Rao', dept: 'Sales', desig: 'Sales Executive', type: 'full_time',
    join: '2017-01-15', status: 'exited', phone: '+91 98450 10007', email: 'vikram.rao@shop.local',
    pan: 'ABCVR7890M', bank: '50100234567897', ifsc: 'HDFC0009012',
    salary: { basic: 21000, hra: 8400, conv: 2000, special: 2000, incentive: 2000, pf: 1800, pt: 200, tds: 0 },
  },
];

const LEAVE_TYPES = [
  ['Casual Leave', 12, 1], ['Sick Leave', 12, 1], ['Earned Leave', 15, 1], ['Loss of Pay', 0, 0],
];

async function ensureDepartment(shopId, name) {
  const row = await get('SELECT * FROM departments WHERE shop_id = ? AND name = ?', shopId, name);
  if (row) return row;
  const id = uid('dept');
  await run('INSERT INTO departments (id, shop_id, name) VALUES (?,?,?)', id, shopId, name);
  return get('SELECT * FROM departments WHERE id = ?', id);
}

async function ensureDesignation(shopId, name, grade) {
  const row = await get('SELECT * FROM designations WHERE shop_id = ? AND name = ?', shopId, name);
  if (row) return row;
  const id = uid('desig');
  await run('INSERT INTO designations (id, shop_id, name, grade) VALUES (?,?,?,?)', id, shopId, name, grade);
  return get('SELECT * FROM designations WHERE id = ?', id);
}

async function ensureLeaveType(shopId, name, quota, paid) {
  const row = await get('SELECT * FROM leave_types WHERE shop_id = ? AND name = ?', shopId, name);
  if (row) return row;
  const id = uid('lvt');
  await run('INSERT INTO leave_types (id, shop_id, name, annual_quota, paid) VALUES (?,?,?,?,?)', id, shopId, name, quota, paid);
  return get('SELECT * FROM leave_types WHERE id = ?', id);
}

const HOLIDAYS = [
  ['01-26', 'Republic Day', 'public'],
  ['03-04', 'Holi', 'festival'],
  ['05-01', 'May Day', 'public'],
  ['08-15', 'Independence Day', 'public'],
  ['10-02', 'Gandhi Jayanti', 'public'],
  ['11-08', 'Diwali', 'festival'],
  ['12-25', 'Christmas', 'public'],
];

function lopWeights(rows) {
  const map = new Map();
  for (const r of rows) {
    const w = r.status === 'half_day' ? 0.5 : 1;
    map.set(r.work_date, Math.max(map.get(r.work_date) || 0, w));
  }
  return map;
}

async function createPayrollRun(shop, adminId, period, status) {
  const [y, m] = period.split('-').map(Number);
  const from = `${period}-01`;
  const workingDays = new Date(y, m, 0).getDate();
  const to = `${period}-${pad(workingDays)}`;
  let payroll = await get('SELECT * FROM payroll_runs WHERE shop_id = ? AND period = ?', shop.id, period);
  if (payroll) {
    const [slips] = await all('SELECT COUNT(*)::int AS c FROM payslips WHERE payroll_run_id = ?', payroll.id);
    // Existing drafts with no payslips (e.g. created before salary structures
    // existed) are filled; locked/paid runs are never touched.
    if (slips.c > 0 || payroll.status !== 'draft') return { run: payroll, created: false, net: 0 };
    await run('UPDATE payroll_runs SET working_days = ? WHERE id = ?', workingDays, payroll.id);
  } else {
    const id = uid('pay');
    await run(
      `INSERT INTO payroll_runs (id, shop_id, period, working_days, status, created_by, locked_at, paid_at)
       VALUES (?,?,?,?,?,?,${status === 'paid' ? 'now()' : 'NULL'},${status === 'paid' ? 'now()' : 'NULL'})`,
      id, shop.id, period, workingDays, status, adminId);
    payroll = await get('SELECT * FROM payroll_runs WHERE id = ?', id);
  }

  const employees = await all(
    `SELECT * FROM employees WHERE shop_id = ? AND (status IN ('active','notice') OR
       (exit_date IS NOT NULL AND exit_date >= ? AND exit_date <= ?)) ORDER BY full_name`,
    shop.id, from, to);
  let netTotal = 0;
  for (const emp of employees) {
    const structure = await get(
      `SELECT * FROM salary_structures WHERE employee_id = ? AND shop_id = ? AND active = 1 AND effective_from <= ?
       ORDER BY effective_from DESC LIMIT 1`, emp.id, shop.id, to);
    if (!structure) continue;
    const attendance = await all(
      `SELECT work_date, status FROM attendance WHERE employee_id = ? AND work_date BETWEEN ? AND ?
       AND status IN ('absent','half_day')`, emp.id, from, to);
    const weights = lopWeights(attendance);
    const unpaid = await all(
      `SELECT l.from_date, l.to_date FROM leave_requests l JOIN leave_types t ON t.id = l.leave_type_id
       WHERE l.employee_id = ? AND l.status = 'approved' AND t.paid = 0
         AND NOT (l.to_date < ? OR l.from_date > ?)`, emp.id, from, to);
    for (const l of unpaid) {
      let d = l.from_date > from ? l.from_date : from;
      const end = l.to_date < to ? l.to_date : to;
      while (d <= end) {
        weights.set(d, Math.max(weights.get(d) || 0, 1));
        d = iso(addDays(new Date(`${d}T00:00:00`), 1));
      }
    }
    const lopDays = round2([...weights.values()].reduce((s, v) => s + v, 0));
    const gross = round2(Number(structure.basic_inr) + Number(structure.hra_inr) + Number(structure.conveyance_inr) +
      Number(structure.special_allowance_inr) + Number(structure.incentive_inr));
    const lopDeduction = round2(Math.min(gross, (gross / workingDays) * lopDays));
    const deductions = round2(Number(structure.pf_inr) + Number(structure.esi_inr) +
      Number(structure.professional_tax_inr) + Number(structure.tds_inr) +
      Number(structure.other_deduction_inr) + lopDeduction);
    const net = round2(gross - deductions);
    netTotal = round2(netTotal + net);
    await run(
      `INSERT INTO payslips (id, shop_id, payroll_run_id, employee_id, days_present, lop_days,
         basic_inr, hra_inr, conveyance_inr, special_allowance_inr, incentive_inr, gross_inr,
         pf_inr, esi_inr, professional_tax_inr, tds_inr, other_deduction_inr,
         lop_deduction_inr, total_deductions_inr, net_inr)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      uid('slip'), shop.id, payroll.id, emp.id, round2(Math.max(0, workingDays - lopDays)), lopDays,
      round2(structure.basic_inr), round2(structure.hra_inr), round2(structure.conveyance_inr),
      round2(structure.special_allowance_inr), round2(structure.incentive_inr), gross,
      round2(structure.pf_inr), round2(structure.esi_inr), round2(structure.professional_tax_inr),
      round2(structure.tds_inr), round2(structure.other_deduction_inr),
      lopDeduction, deductions, net);
  }
  if (status === 'paid' && netTotal > 0) {
    await run(
      `INSERT INTO expenses (id, shop_id, category, amount_inr, spent_at, note, created_by)
       VALUES (?,?,?,?,now(),?,?)`, uid('exp'), shop.id, 'salary', netTotal, `Payroll ${period}`, adminId);
  }
  return { run: payroll, created: true, net: netTotal };
}

async function seedHrDemo(shop, admin) {
  const existing = await get('SELECT COUNT(*)::int AS c FROM employees WHERE shop_id = ?', shop.id);
  if (existing.c > 0) {
    console.log(`[seed-hr] ${existing.c} employees already present - keeping HR demo data`);
    // Repair an empty draft run if one was created before salary structures existed.
    const empties = await all(
      `SELECT pr.period FROM payroll_runs pr
       WHERE pr.shop_id = ? AND pr.status = 'draft'
         AND NOT EXISTS (SELECT 1 FROM payslips ps WHERE ps.payroll_run_id = pr.id)`, shop.id);
    for (const e of empties) await createPayrollRun(shop, admin.user_id, e.period, 'draft');
    if (empties.length) console.log(`[seed-hr] filled ${empties.length} empty draft payroll run(s)`);
    return;
  }

  const departments = {};
  for (const name of DEPARTMENTS) departments[name] = await ensureDepartment(shop.id, name);
  const designations = {};
  for (const [name, grade] of DESIGNATIONS) designations[name] = await ensureDesignation(shop.id, name, grade);
  const types = {};
  for (const [name, quota, paid] of LEAVE_TYPES) types[name] = await ensureLeaveType(shop.id, name, quota, paid);

  const now = new Date();
  const year = now.getFullYear();
  const currentPeriod = periodOf(now);
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevPeriod = periodOf(prevMonth);
  const prevDays = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).getDate();
  const exitDate = `${prevPeriod}-${pad(prevDays)}`;

  // Holidays for this year and next.
  for (const y of [year, year + 1]) {
    for (const [md, name, type] of HOLIDAYS) {
      const date = `${y}-${md}`;
      const exists = await get('SELECT id FROM holidays WHERE shop_id = ? AND holiday_date = ?', shop.id, date);
      if (!exists) {
        await run('INSERT INTO holidays (id, shop_id, holiday_date, name, holiday_type) VALUES (?,?,?,?,?)',
          uid('hol'), shop.id, date, name, type);
      }
    }
  }

  // Employees
  const empByCode = {};
  for (const s of STAFF) {
    const id = uid('emp');
    await run(
      `INSERT INTO employees (id, shop_id, emp_code, full_name, phone, email, gender, address,
         department_id, designation_id, employment_type, joining_date, exit_date, status,
         bank_account, bank_ifsc, pan)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, shop.id, s.code, s.name, s.phone, s.email, s.code === 'EMP-002' || s.code === 'EMP-004' || s.code === 'EMP-006' ? 'female' : 'male',
      'Bengaluru, Karnataka', departments[s.dept].id, designations[s.desig].id, s.type, s.join,
      s.status === 'exited' ? exitDate : null, s.status, s.bank, s.ifsc, s.pan);
    empByCode[s.code] = { ...s, id };
  }

  // Salary structures (effective from joining date; one per employee)
  for (const s of Object.values(empByCode)) {
    const p = s.salary;
    await run(
      `INSERT INTO salary_structures (id, shop_id, employee_id, effective_from, basic_inr, hra_inr,
         conveyance_inr, special_allowance_inr, incentive_inr, pf_inr, esi_inr, professional_tax_inr, tds_inr)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (employee_id, effective_from) DO NOTHING`,
      uid('sal'), shop.id, s.id, s.join, p.basic, p.hra, p.conv, p.special, p.incentive, p.pf, 0, p.pt, p.tds);
  }

  // Leave balances for the current year
  for (const emp of Object.values(empByCode).filter((e) => e.status !== 'exited')) {
    for (const [name, quota] of LEAVE_TYPES) {
      await run(
        `INSERT INTO leave_balances (id, shop_id, employee_id, leave_type_id, year, entitled, used)
         VALUES (?,?,?,?,?,?,0) ON CONFLICT (employee_id, leave_type_id, year) DO NOTHING`,
        uid('lvb'), shop.id, emp.id, types[name].id, year, quota);
    }
  }

  async function addLeave(empCode, typeName, from, to, status, note) {
    const emp = empByCode[empCode];
    const type = types[typeName];
    const days = Math.round((Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`)) / 86400000) + 1;
    const id = uid('lvr');
    await run(
      `INSERT INTO leave_requests (id, shop_id, employee_id, leave_type_id, from_date, to_date, days, reason,
         status, decided_by, decided_at, decision_note)
       VALUES (?,?,?,?,?,?,?,?,?,?,${status === 'pending' ? 'NULL' : 'now()'},?)`,
      id, shop.id, emp.id, type.id, from, to, days, note, status,
      status === 'pending' ? null : admin.user_id, status === 'pending' ? null : note);
    if (status === 'approved') {
      const ly = Number(from.slice(0, 4));
      await run(
        `INSERT INTO leave_balances (id, shop_id, employee_id, leave_type_id, year, entitled, used)
         VALUES (?,?,?,?,?,?,?)
         ON CONFLICT (employee_id, leave_type_id, year)
         DO UPDATE SET used = leave_balances.used + EXCLUDED.used`,
        uid('lvb'), shop.id, emp.id, type.id, ly, 0, days);
      let d = new Date(`${from}T00:00:00`);
      const end = new Date(`${to}T00:00:00`);
      while (d <= end) {
        await run(
          `INSERT INTO attendance (id, shop_id, employee_id, work_date, status, source, note, created_by)
           VALUES (?,?,?,?,'leave','seed',?,?)
           ON CONFLICT (employee_id, work_date) DO NOTHING`,
          uid('att'), shop.id, emp.id, iso(d), `${typeName} (approved)`, admin.user_id);
        d = addDays(d, 1);
      }
    }
    return id;
  }

  // A paid sick leave, an unpaid LOP day, a pending request and a rejected one.
  await addLeave('EMP-002', 'Sick Leave', `${prevPeriod}-20`, `${prevPeriod}-21`, 'approved', 'Viral fever');
  await addLeave('EMP-006', 'Loss of Pay', `${prevPeriod}-22`, `${prevPeriod}-22`, 'approved', 'Personal work');
  await addLeave('EMP-003', 'Casual Leave', iso(addDays(now, 1)), iso(addDays(now, 2)), 'pending', 'Family function');
  await addLeave('EMP-004', 'Earned Leave', `${prevPeriod}-15`, `${prevPeriod}-15`, 'rejected', 'Peak season - please reschedule');

  // Attendance from the start of last month through today. Sundays are week off.
  const start = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 1);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (const emp of Object.values(empByCode).filter((e) => e.status !== 'exited')) {
    let d = new Date(start);
    while (d <= today) {
      const date = iso(d);
      const isSunday = d.getDay() === 0;
      let status = 'present';
      let checkIn = null;
      let checkOut = null;
      let worked = 0;
      let overtime = 0;
      if (isSunday) {
        status = 'week_off';
      } else {
        const r = Math.random();
        if (r < 0.04) status = 'absent';
        else if (r < 0.07) status = 'half_day';
        if (status === 'present' || status === 'half_day') {
          const inMin = 10 * 60 + Math.floor(Math.random() * 12);
          const outMin = status === 'half_day' ? 14 * 60 + Math.floor(Math.random() * 15) : 19 * 60 + Math.floor(Math.random() * 25);
          checkIn = `${pad(Math.floor(inMin / 60))}:${pad(inMin % 60)}`;
          checkOut = `${pad(Math.floor(outMin / 60))}:${pad(outMin % 60)}`;
          worked = outMin - inMin;
          if (status === 'present' && Math.random() < 0.12) overtime = 30 + Math.floor(Math.random() * 60);
        }
      }
      await run(
        `INSERT INTO attendance (id, shop_id, employee_id, work_date, check_in, check_out, status,
           worked_minutes, overtime_minutes, source, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,'seed',?)
         ON CONFLICT (employee_id, work_date) DO NOTHING`,
        uid('att'), shop.id, emp.id, date, checkIn, checkOut, status, worked, overtime, admin.user_id);
      d = addDays(d, 1);
    }
  }

  // Previous month fully paid + current month draft ready to review.
  const prev = await createPayrollRun(shop, admin.user_id, prevPeriod, 'paid');
  const current = await createPayrollRun(shop, admin.user_id, currentPeriod, 'draft');

  const counts = await get(
    `SELECT (SELECT COUNT(*)::int FROM employees WHERE shop_id = ?) AS employees,
            (SELECT COUNT(*)::int FROM attendance WHERE shop_id = ?) AS attendance,
            (SELECT COUNT(*)::int FROM leave_requests WHERE shop_id = ?) AS leaves,
            (SELECT COUNT(*)::int FROM holidays WHERE shop_id = ?) AS holidays`, shop.id, shop.id, shop.id, shop.id);
  console.log(
    `[seed-hr] ${counts.employees} employees, ${counts.attendance} attendance rows, ${counts.leaves} leave requests, ` +
    `${counts.holidays} holidays; payroll ${prevPeriod} ${prev.created ? 'paid' : 'existing'}, ` +
    `${currentPeriod} ${current.created ? 'draft' : 'existing'}`);
}

module.exports = { seedHrDemo };
