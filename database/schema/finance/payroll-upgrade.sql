-- PAYROLL RUNS — column upgrade
-- Run in Supabase → SQL Editor.
-- The original table only had: period, employees, gross, deductions, net, status.
-- This adds the missing columns required by the Payroll module.

alter table payroll_runs
  add column if not exists payroll_number  text,
  add column if not exists employee_name   text,
  add column if not exists employee_type   text default 'Employee',
  add column if not exists hours_worked    numeric,
  add column if not exists basic_pay       numeric default 0,
  add column if not exists overtime        numeric default 0,
  add column if not exists allowances      numeric default 0,
  add column if not exists released_by     text,
  add column if not exists notes           text;
