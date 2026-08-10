-- 016 Let interns fix their own timesheet entries while still unapproved
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Safe to re-run.
--
-- Why:
--   Interns could log hours and delete them, but never correct a typo — the
--   only UPDATE policy on intern_timesheets was the admin/supervisor approval
--   one, so an intern's edit failed silently under RLS.
--
-- Rules preserved (spec §4.1 / §5.3):
--   • approved entries stay permanently locked for everyone, admins included
--   • an intern may edit only their own pending/rejected entries
--   • editing a rejected entry sends it back to pending (handled by the app);
--     interns still cannot approve or reject anything
--   • an intern cannot move an entry to another intern or forge approval stamps

-- 1. Row-level security: allow the owning intern to update unapproved entries.
--    The WITH CHECK half stops the row being handed to someone else or
--    flipped straight to approved.
drop policy if exists "intern_update_own_unapproved" on intern_timesheets;
create policy "intern_update_own_unapproved" on intern_timesheets
  for update to authenticated
  using      (intern_id = auth.uid() and status in ('pending', 'rejected'))
  with check (intern_id = auth.uid() and status in ('pending', 'rejected'));

-- 2. Trigger: same rules as migration 005, plus guards on the columns an
--    intern must never touch (belt-and-braces behind the policy above).
create or replace function public.enforce_timesheet_rules()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  actor_role text;
begin
  if actor is not null then
    actor_role := public.current_user_role();
  end if;

  if tg_op = 'DELETE' then
    if old.status = 'approved' then
      raise exception 'Approved entries are locked and cannot be deleted.';
    end if;
    return old;
  end if;

  -- UPDATE
  if old.status = 'approved' then
    raise exception 'Approved entries are locked.';
  end if;

  if old.status is distinct from new.status then
    if not ((old.status, new.status) in (('pending','approved'),
                                         ('pending','rejected'),
                                         ('rejected','pending'))) then
      raise exception 'Invalid timesheet status transition: % → %', old.status, new.status;
    end if;
    if actor is not null and actor_role = 'intern' and new.status in ('approved','rejected') then
      raise exception 'Interns cannot approve or reject entries.';
    end if;
  end if;

  if actor is not null and actor_role = 'intern' then
    if new.intern_id is distinct from old.intern_id then
      raise exception 'Entries cannot be moved to another intern.';
    end if;
    if new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at then
      raise exception 'Interns cannot set approval details.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_timesheet_rules on intern_timesheets;
create trigger enforce_timesheet_rules
  before update or delete on intern_timesheets
  for each row execute function public.enforce_timesheet_rules();

-- 3. Sanity check — the trigger and both intern policies should be listed.
select tgname, tgrelid::regclass as table_name
from pg_trigger
where tgname = 'enforce_timesheet_rules';

select policyname, cmd
from pg_policies
where tablename = 'intern_timesheets'
order by policyname;
