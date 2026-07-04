-- ENFORCE-STATE-RULES.SQL
-- Run ONCE in Supabase → SQL Editor (safe to re-run; no rollback inside).
--
-- Implements the handover spec's "non-negotiable" rules at the DATABASE
-- level (spec §2.2, §4.1, §4.3) — until now they were only enforced by the
-- UI, so a user talking to the REST API directly could bypass them:
--   • task status must follow assigned → acknowledged → in_progress →
--     completed → reviewed, no skips, no rollback, reviewed = locked
--   • interns advance only their own tasks and never to 'reviewed';
--     supervisors/admins only advance completed → reviewed
--   • interns can only change a task's status/output_link, nothing else;
--     only admins create tasks (status must start 'assigned')
--   • approved timesheets are permanently locked (no edit, no delete)
--   • interns cannot approve/reject entries (closes the intern
--     self-approval hole in intern_update_pending's with-check)
--   • deleting timesheet entries is allowed only while pending/rejected
--
-- Triggers are security definer and skip role checks when auth.uid() is
-- null (SQL editor maintenance), but state-machine rules always apply.

-- Step 1: task rules
create or replace function public.enforce_task_rules()
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

  if tg_op = 'INSERT' then
    if actor is not null then
      if actor_role is distinct from 'admin' then
        raise exception 'Only admins can create tasks.';
      end if;
      if new.status <> 'assigned' then
        raise exception 'New tasks must start as assigned.';
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status = 'reviewed' then
      raise exception 'Reviewed tasks are locked and cannot be deleted.';
    end if;
    if actor is not null and actor_role is distinct from 'admin' then
      raise exception 'Only admins can delete tasks.';
    end if;
    return old;
  end if;

  -- UPDATE
  if old.status = 'reviewed' then
    raise exception 'Reviewed tasks are locked.';
  end if;

  if old.status is distinct from new.status then
    if not ((old.status, new.status) in (('assigned','acknowledged'),
                                         ('acknowledged','in_progress'),
                                         ('in_progress','completed'),
                                         ('completed','reviewed'))) then
      raise exception 'Invalid task status transition: % → %', old.status, new.status;
    end if;
    if actor is not null then
      if actor_role = 'intern' then
        if old.assigned_to is distinct from actor then
          raise exception 'Interns can only advance their own tasks.';
        end if;
        if new.status = 'reviewed' then
          raise exception 'Only supervisors or admins can mark tasks reviewed.';
        end if;
      elsif new.status <> 'reviewed' then
        raise exception 'Supervisors/admins only advance completed tasks to reviewed.';
      end if;
    end if;
  end if;

  -- Interns may only touch status and output_link
  if actor is not null and actor_role = 'intern' then
    if (old.title, old.description, old.assigned_to, old.assigned_by, old.priority,
        coalesce(old.due_date, '1900-01-01'), coalesce(old.industry_category, ''),
        coalesce(old.output_type, ''), coalesce(old.skills, '{}'))
       is distinct from
       (new.title, new.description, new.assigned_to, new.assigned_by, new.priority,
        coalesce(new.due_date, '1900-01-01'), coalesce(new.industry_category, ''),
        coalesce(new.output_type, ''), coalesce(new.skills, '{}')) then
      raise exception 'Interns can only update a task''s status and output link.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_task_rules on intern_tasks;
create trigger enforce_task_rules
  before insert or update or delete on intern_tasks
  for each row execute function public.enforce_task_rules();

-- Step 2: timesheet rules
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

  return new;
end;
$$;

drop trigger if exists enforce_timesheet_rules on intern_timesheets;
create trigger enforce_timesheet_rules
  before update or delete on intern_timesheets
  for each row execute function public.enforce_timesheet_rules();

-- Step 3: allow deleting entries while pending/rejected (spec §5.3);
-- the trigger above still hard-blocks deleting approved rows
drop policy if exists "intern_delete_own_unapproved" on intern_timesheets;
create policy "intern_delete_own_unapproved" on intern_timesheets
  for delete to authenticated
  using (intern_id = auth.uid() and status in ('pending','rejected'));

drop policy if exists "staff_delete_unapproved" on intern_timesheets;
create policy "staff_delete_unapproved" on intern_timesheets
  for delete to authenticated
  using (public.current_user_role() in ('admin','supervisor') and status in ('pending','rejected'));

-- Step 4: sanity check — both triggers should be listed
select tgname, tgrelid::regclass as table_name
from pg_trigger
where tgname in ('enforce_task_rules', 'enforce_timesheet_rules');
