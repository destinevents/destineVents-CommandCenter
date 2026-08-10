-- 017: Repair the signup approval flow.
--
-- THE BUG
-- Migration 002 created handle_new_intern_user() and attached the
-- on_auth_user_created trigger to it. seeds/seed_auto_trigger.sql later DROPPED
-- that trigger and re-pointed it at a different function, handle_new_user(),
-- which hardcodes role = 'intern' and ignores requested_role entirely.
-- Migration 006 then rewrote handle_new_intern_user() to correctly set
-- role = 'pending' + requested_role, but never re-attached the trigger — so the
-- corrected function has been orphaned and the seed's version has been winning.
--
-- Effect: every signup lands as 'intern' on the ICC portal no matter what the
-- person picked at signup, and the admin's "Pending Approval" table is
-- permanently empty because no row ever reaches role = 'pending'.
--
-- This migration re-points the trigger at the correct function and deletes the
-- wrong one so it cannot win again. Safe to re-run.

-- ─── 1. Re-apply 006's schema, in case 006 never ran ─────────────────────────

alter table intern_users drop constraint if exists intern_users_role_check;
alter table intern_users add constraint intern_users_role_check
  check (role in ('admin','supervisor','intern','pending',
                  'finance_officer','external_accountant','team_staff'));

alter table intern_users add column if not exists requested_role text;

alter table intern_users drop constraint if exists intern_users_requested_role_check;
alter table intern_users add constraint intern_users_requested_role_check
  check (requested_role is null or requested_role in
    ('supervisor','intern','finance_officer','external_accountant','team_staff'));

-- ─── 2. The one correct signup handler ───────────────────────────────────────
-- Combines 006's approval logic (pending + requested_role) with the profile
-- fields the seed's version captured (avatar, program, school). Dropping either
-- half silently breaks something: without the first, approvals never reach the
-- admin; without the second, intern cards lose their school and course.

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

  -- Only honour a requested_role we recognise. Anything else (including a
  -- hand-crafted signup payload) falls back to null, leaving the admin to
  -- choose. Never read 'role' from user_metadata — account holders can edit
  -- their own metadata, which was the privilege-escalation hole closed in
  -- July 2026.
  v_requested := nullif(new.raw_user_meta_data->>'requested_role', '');
  if v_requested not in ('supervisor','intern','finance_officer',
                         'external_accountant','team_staff') then
    v_requested := null;
  end if;

  insert into public.intern_users
    (id, name, email, role, requested_role, avatar, program, school)
  values (
    new.id,
    v_name,
    new.email,
    'pending',                      -- always pending; the admin promotes
    v_requested,
    upper(left(v_name, 2)),
    nullif(new.raw_user_meta_data->>'program', ''),
    nullif(new.raw_user_meta_data->>'school', '')
  )
  on conflict (id) do update set email = excluded.email;

  return new;
end;
$$;

-- ─── 3. Point the trigger at it ──────────────────────────────────────────────

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_intern_user();

-- ─── 4. Remove the function that caused the bug ──────────────────────────────
-- Nothing references it now. Dropping it means re-running the old seed file
-- fails loudly instead of silently re-breaking approvals.

drop function if exists public.handle_new_user();

-- ─── 5. Existing users are deliberately left alone ───────────────────────────
-- No back-fill here. Anyone already sitting at role = 'intern' may be a real,
-- active intern; flipping them to 'pending' would lock them out of ICC mid-use.
-- Change individual accounts on purpose via ops/promote-user-role.sql instead.

-- ─── 6. Verify ───────────────────────────────────────────────────────────────
-- Expect: on_auth_user_created -> handle_new_intern_user

select t.tgname, p.proname as calls_function
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
 where t.tgname = 'on_auth_user_created';
