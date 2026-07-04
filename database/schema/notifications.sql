-- NOTIFICATIONS.SQL
-- Run ONCE in Supabase → SQL Editor (safe to re-run; no rollback inside —
-- the editor executes a pasted script as one transaction).
--
-- Persistent notification center: DB triggers create a row whenever a task
-- is assigned/edited/reviewed or a timesheet is approved/rejected, so
-- recipients see them even if they were offline when it happened. The app
-- subscribes to INSERTs on this table for live toasts and shows the history
-- in the bell dropdown.

-- Step 1: table
create table if not exists intern_notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references intern_users(id) on delete cascade not null,
  type       text not null,
  message    text not null,
  link_page  text,
  read       boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists intern_notifications_user_created
  on intern_notifications (user_id, created_at desc);

-- Step 2: RLS — users see and manage only their own rows. No INSERT policy:
-- rows are created exclusively by the security-definer triggers below.
alter table intern_notifications enable row level security;

drop policy if exists "own_notifications_select" on intern_notifications;
create policy "own_notifications_select" on intern_notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "own_notifications_update" on intern_notifications;
create policy "own_notifications_update" on intern_notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "own_notifications_delete" on intern_notifications;
create policy "own_notifications_delete" on intern_notifications
  for delete to authenticated using (user_id = auth.uid());

-- Step 3: trigger — tasks
-- Skips self-notifications: auth.uid() is the acting user; `is distinct from`
-- keeps notifications flowing when there is no session (SQL editor seeds).
create or replace function public.notify_task_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.assigned_to is not null and new.assigned_to is distinct from auth.uid() then
      insert into intern_notifications (user_id, type, message, link_page)
      values (new.assigned_to, 'task_assigned',
              '📋 New task assigned to you: “' || new.title || '”', 'tasks');
    end if;
    return new;
  end if;

  -- UPDATE
  if new.assigned_to is null then
    return new;
  end if;

  if old.assigned_to is distinct from new.assigned_to then
    if new.assigned_to is distinct from auth.uid() then
      insert into intern_notifications (user_id, type, message, link_page)
      values (new.assigned_to, 'task_assigned',
              '📋 Task reassigned to you: “' || new.title || '”', 'tasks');
    end if;
  elsif old.status is distinct from new.status then
    if new.status = 'reviewed' and new.assigned_to is distinct from auth.uid() then
      insert into intern_notifications (user_id, type, message, link_page)
      values (new.assigned_to, 'task_reviewed',
              '🎉 Your task “' || new.title || '” was reviewed!', 'tasks');
    end if;
  elsif (old.title, old.description, old.priority, coalesce(old.due_date, '1900-01-01'))
        is distinct from
        (new.title, new.description, new.priority, coalesce(new.due_date, '1900-01-01')) then
    if new.assigned_to is distinct from auth.uid() then
      insert into intern_notifications (user_id, type, message, link_page)
      values (new.assigned_to, 'task_updated',
              '✏️ Task updated: “' || new.title || '”', 'tasks');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_task_change_notify on intern_tasks;
create trigger on_task_change_notify
  after insert or update on intern_tasks
  for each row execute function public.notify_task_change();

-- Step 4: trigger — timesheets
create or replace function public.notify_sheet_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status
     and new.intern_id is distinct from auth.uid() then
    if new.status = 'approved' then
      insert into intern_notifications (user_id, type, message, link_page)
      values (new.intern_id, 'sheet_approved',
              '✅ Your ' || new.hours || 'h entry for ' || new.date || ' was approved!', 'timesheets');
    elsif new.status = 'rejected' then
      insert into intern_notifications (user_id, type, message, link_page)
      values (new.intern_id, 'sheet_rejected',
              '❌ Your entry for ' || new.date || ' was rejected' ||
              case when new.rejection_reason is not null and new.rejection_reason <> ''
                   then ': ' || new.rejection_reason else '.' end, 'timesheets');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_sheet_change_notify on intern_timesheets;
create trigger on_sheet_change_notify
  after update on intern_timesheets
  for each row execute function public.notify_sheet_change();

-- Step 5: realtime (idempotent)
do $$
begin
  alter publication supabase_realtime add table intern_notifications;
exception when duplicate_object then null;
end $$;

-- Step 6: sanity check — should list the table's three policies
select policyname, cmd from pg_policies where tablename = 'intern_notifications';
