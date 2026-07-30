-- 015 Broaden partner access + ensure project_id column
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Safe to re-run.
--
-- Why:
--   1. The `partners` table was locked to role = 'admin' only, so a
--      finance_officer could not add or manage partners. This widens the
--      policy to admin + finance_officer.
--   2. The optional `partners.project_id` column is added defensively here in
--      case an instance never ran migration 007, which would make every
--      partner insert fail with an "undefined column" error.

-- 1. Ensure the optional project association column exists (nullable, so
--    existing rows are unaffected).
ALTER TABLE partners ADD COLUMN IF NOT EXISTS project_id bigint;

-- 2. Broaden the row-level security policy to include finance_officer.
drop policy if exists "auth_all"          on partners;
drop policy if exists "admin_only"        on partners;
drop policy if exists "admin_or_finance"  on partners;

create policy "admin_or_finance" on partners for all to authenticated
  using (public.current_user_role() in ('admin', 'finance_officer'))
  with check (public.current_user_role() in ('admin', 'finance_officer'));
