-- 0007 (Postgres): HR management — Phase 1
-- Employees, attendance (manual + biometric import), leave, holidays,
-- salary structures, monthly payroll runs and payslips.
-- Admin-only at the API layer. Dates are TEXT 'YYYY-MM-DD' so a date never
-- shifts across timezones (the app compares them as plain strings).

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, name)
);

CREATE TABLE IF NOT EXISTS designations (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  name TEXT NOT NULL,
  grade TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, name)
);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  user_id TEXT REFERENCES profiles(user_id) ON DELETE SET NULL,
  emp_code TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  dob TEXT,
  gender TEXT,
  address TEXT,
  department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
  designation_id TEXT REFERENCES designations(id) ON DELETE SET NULL,
  branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
  manager_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  employment_type TEXT NOT NULL DEFAULT 'full_time',
  joining_date TEXT NOT NULL,
  exit_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  bank_account TEXT,
  bank_ifsc TEXT,
  pan TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, emp_code)
);
CREATE INDEX IF NOT EXISTS idx_employees_shop_status ON employees(shop_id, status);

CREATE TABLE IF NOT EXISTS holidays (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  holiday_date TEXT NOT NULL,
  name TEXT NOT NULL,
  holiday_type TEXT NOT NULL DEFAULT 'public',
  UNIQUE (shop_id, holiday_date)
);

CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  status TEXT NOT NULL DEFAULT 'present',
  worked_minutes INTEGER NOT NULL DEFAULT 0,
  overtime_minutes INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  note TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, work_date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_shop_date ON attendance(shop_id, work_date);

CREATE TABLE IF NOT EXISTS leave_types (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  name TEXT NOT NULL,
  annual_quota DOUBLE PRECISION NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE (shop_id, name)
);

CREATE TABLE IF NOT EXISTS leave_balances (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id TEXT NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  entitled DOUBLE PRECISION NOT NULL DEFAULT 0,
  used DOUBLE PRECISION NOT NULL DEFAULT 0,
  UNIQUE (employee_id, leave_type_id, year)
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id TEXT NOT NULL REFERENCES leave_types(id),
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL,
  days DOUBLE PRECISION NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leave_requests_shop_status ON leave_requests(shop_id, status, created_at);

CREATE TABLE IF NOT EXISTS salary_structures (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  effective_from TEXT NOT NULL,
  basic_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  hra_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  conveyance_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  special_allowance_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  incentive_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  pf_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  esi_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  professional_tax_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  tds_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  other_deduction_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, effective_from)
);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  period TEXT NOT NULL,
  working_days DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  UNIQUE (shop_id, period)
);

CREATE TABLE IF NOT EXISTS payslips (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  payroll_run_id TEXT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  days_present DOUBLE PRECISION NOT NULL DEFAULT 0,
  lop_days DOUBLE PRECISION NOT NULL DEFAULT 0,
  basic_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  hra_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  conveyance_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  special_allowance_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  incentive_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  gross_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  pf_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  esi_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  professional_tax_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  tds_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  other_deduction_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  lop_deduction_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_deductions_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  net_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payroll_run_id, employee_id)
);
CREATE INDEX IF NOT EXISTS idx_payslips_employee ON payslips(employee_id, created_at);
