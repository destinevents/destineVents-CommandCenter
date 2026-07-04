-- FIX-RLS-RECURSION.SQL
-- Run ONCE in Supabase → SQL Editor (safe to re-run).
--
-- Problem: policies on intern_users subqueried intern_users itself, which
-- Postgres rejects at query time with "infinite recursion detected in policy
-- for relation intern_users". Because every other table's role check also
-- subqueries intern_users, EVERY role lookup failed — and the app's fallback
-- treated everyone (including admins) as interns.
--
-- Fix: security definer helper functions bypass RLS inside their body,
-- breaking the recursion. All role checks now call the function instead.

-- Step 1: helper functions
create or replace function public.current_user_role()
returns text
language sql security definer stable
set search_path = public
as $$
  select role from intern_users where id = auth.uid()
$$;

create or replace function public.current_user_email()
returns text
language sql security definer stable
set search_path = public
as $$
  select email from intern_users where id = auth.uid()
$$;

-- Step 2: recreate intern_users policies
drop policy if exists "read_all_users" on intern_users;
create policy "read_all_users" on intern_users for select to authenticated using (true);

drop policy if exists "admin_write_users" on intern_users;
create policy "admin_write_users" on intern_users for all to authenticated
  using (public.current_user_role() in ('admin', 'supervisor'))
  with check (public.current_user_role() in ('admin', 'supervisor'));

drop policy if exists "intern_update_own_profile" on intern_users;
create policy "intern_update_own_profile" on intern_users
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role  = public.current_user_role()
    and email = public.current_user_email()
  );

-- Step 3: recreate intern_tasks policies
drop policy if exists "intern_own_tasks" on intern_tasks;
create policy "intern_own_tasks" on intern_tasks for select to authenticated
  using (
    assigned_to = auth.uid()
    or public.current_user_role() in ('admin', 'supervisor')
  );

drop policy if exists "admin_manage_tasks" on intern_tasks;
create policy "admin_manage_tasks" on intern_tasks for all to authenticated
  using (public.current_user_role() in ('admin', 'supervisor'))
  with check (public.current_user_role() in ('admin', 'supervisor'));

-- Step 4: recreate intern_timesheets policies
drop policy if exists "intern_own_sheets" on intern_timesheets;
create policy "intern_own_sheets" on intern_timesheets for select to authenticated
  using (
    intern_id = auth.uid()
    or public.current_user_role() in ('admin', 'supervisor')
  );

drop policy if exists "admin_approve_sheets" on intern_timesheets;
create policy "admin_approve_sheets" on intern_timesheets for update to authenticated
  using (public.current_user_role() in ('admin', 'supervisor'));

-- Step 5: recreate intern_audit_logs policy
drop policy if exists "admin_read_logs" on intern_audit_logs;
create policy "admin_read_logs" on intern_audit_logs for select to authenticated
  using (public.current_user_role() in ('admin', 'supervisor'));

-- Step 6: recreate HQ table policies (clients, proposals, ...)
drop policy if exists "admin_only" on clients;
create policy "admin_only" on clients      for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

drop policy if exists "admin_only" on proposals;
create policy "admin_only" on proposals    for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

drop policy if exists "admin_only" on partners;
create policy "admin_only" on partners     for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

drop policy if exists "admin_only" on invoices;
create policy "admin_only" on invoices     for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

drop policy if exists "admin_only" on bills;
create policy "admin_only" on bills        for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

drop policy if exists "admin_only" on payroll_runs;
create policy "admin_only" on payroll_runs for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

drop policy if exists "admin_only" on documents;
create policy "admin_only" on documents    for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- Step 7: sanity check — lists the policies now in force (read-only)
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- ─── VERIFICATION — RUN AS A SEPARATE QUERY, NOT WITH THE SCRIPT ABOVE ───────
-- The SQL Editor executes each run as ONE transaction, so a rollback pasted
-- together with the fix would undo the fix itself. After the script above has
-- run on its own, paste ONLY the block below as a new query. It simulates
-- Jenn's session and must print 'admin' (not an error).
--
-- begin;
-- set local role authenticated;
-- select set_config(
--   'request.jwt.claims',
--   '{"sub":"73bd1035-1f9b-4012-8324-b99470a86c29","role":"authenticated"}',
--   true
-- );
-- select role as jenn_role_as_seen_by_app
-- from intern_users
-- where id = auth.uid();
-- rollback;
