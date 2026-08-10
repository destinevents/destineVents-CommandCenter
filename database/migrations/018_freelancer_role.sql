-- 018: Add the 'freelancer' role to the HQ portal.
--
-- Freelancers are contracted external workers. They sit on the HQ side (not
-- ICC), and are scoped like team_staff minus client access: they see the
-- projects and documents they need to deliver work, and nothing financial.
--
-- Run AFTER 017 — this widens the constraints 017 rewrites, so applying them
-- out of order would drop 'freelancer' back off. Safe to re-run.

-- ─── 1. Allow the new role ───────────────────────────────────────────────────

alter table intern_users drop constraint if exists intern_users_role_check;
alter table intern_users add constraint intern_users_role_check
  check (role in ('admin','supervisor','intern','pending','freelancer',
                  'finance_officer','external_accountant','team_staff'));

-- People can also request it at signup.
alter table intern_users drop constraint if exists intern_users_requested_role_check;
alter table intern_users add constraint intern_users_requested_role_check
  check (requested_role is null or requested_role in
    ('supervisor','intern','freelancer',
     'finance_officer','external_accountant','team_staff'));

-- ─── 2. Teach the signup handler the new role ────────────────────────────────
-- Same function as 017, with 'freelancer' added to the allow-list. Kept as a
-- full replacement rather than a patch so the live definition always matches
-- the most recent migration that touched it.

create or replace function public.handle_new_intern_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_name text;
  v_requested text;
begin
  v_name := coalesce(
    nullif(new.raw_user_meta_data->>'name', ''),
    nullif(new.raw_user_meta_data->>'full_name', ''),
    split_part(new.email, '@', 1)
  );

  v_requested := nullif(new.raw_user_meta_data->>'requested_role', '');
  if v_requested not in ('supervisor','intern','freelancer','finance_officer',
                         'external_accountant','team_staff') then
    v_requested := null;
  end if;

  insert into public.intern_users
    (id, name, email, role, requested_role, avatar, program, school)
  values (
    new.id,
    v_name,
    new.email,
    'pending',
    v_requested,
    upper(left(v_name, 2)),
    nullif(new.raw_user_meta_data->>'program', ''),
    nullif(new.raw_user_meta_data->>'school', '')
  )
  on conflict (id) do update set email = excluded.email;

  return new;
end;
$$;

-- ─── 3. Columns the app already reads but no migration ever declared ─────────
-- apps/icc/admin/admin.ts reads required_hours and completed_at, so these were
-- added by hand in the dashboard at some point. Declaring them here makes the
-- schema reproducible from migrations alone. No-ops if they already exist.

alter table intern_users add column if not exists required_hours integer;
alter table intern_users add column if not exists completed_at   timestamptz;

-- ─── 4. Verify ───────────────────────────────────────────────────────────────

select conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid = 'intern_users'::regclass
   and conname in ('intern_users_role_check','intern_users_requested_role_check');
