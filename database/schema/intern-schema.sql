-- INTERN COMMAND CENTER SCHEMA
-- Run in Supabase → SQL Editor
-- Same project as HQ tables (clients, proposals, etc.)

-- INTERN PROFILES (extends auth.users)
create table if not exists intern_users (
  id           uuid primary key references auth.users(id) on delete cascade,
  name         text not null,
  email        text not null,
  role         text not null check (role in ('admin', 'supervisor', 'intern')),
  avatar       text,
  program      text,
  school       text,
  created_at   timestamptz default now()
);

-- TASKS
create table if not exists intern_tasks (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null,
  description         text,
  assigned_to         uuid references intern_users(id),
  assigned_by         uuid references intern_users(id),
  priority            text check (priority in ('low', 'medium', 'high')) default 'medium',
  status              text check (status in ('assigned', 'acknowledged', 'in_progress', 'completed', 'reviewed')) default 'assigned',
  due_date            date,
  industry_category   text,
  output_type         text check (output_type in ('code', 'design', 'video', 'document', 'automation', 'landing_page')),
  output_link         text,
  skills              text[],
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- TIMESHEETS
create table if not exists intern_timesheets (
  id                   uuid primary key default gen_random_uuid(),
  intern_id            uuid references intern_users(id) not null,
  date                 date not null,
  hours numeric(4,1) check (hours >= 0.5 and hours <= 10) not null,
  task_id              uuid references intern_tasks(id),
  activity_description text not null,
  industry_category    text,
  skills               text[],
  status               text check (status in ('pending', 'approved', 'rejected')) default 'pending',
  approved_by          uuid references intern_users(id),
  approved_at          timestamptz,
  rejection_reason     text,
  created_at           timestamptz default now()
);

-- AUDIT LOGS
create table if not exists intern_audit_logs (
  id           uuid primary key default gen_random_uuid(),
  action       text not null,
  performed_by uuid references intern_users(id),
  target_type  text,
  target_id    uuid,
  metadata     jsonb,
  created_at   timestamptz default now()
);

-- ROW LEVEL SECURITY
alter table intern_users       enable row level security;
alter table intern_tasks       enable row level security;
alter table intern_timesheets  enable row level security;
alter table intern_audit_logs  enable row level security;

-- TRIGGER: auto-create intern_users row when auth.users row is created
create or replace function handle_new_intern_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into intern_users (id, name, email, role)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(new.email, '@', 1)
    ),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'role', 'intern')
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_intern_user();

-- intern_users policies
create policy "read_all_users" on intern_users for select to authenticated using (true);

drop policy if exists "admin_write_users" on intern_users;
create policy "admin_write_users" on intern_users for all to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'supervisor')
    or (select role from intern_users where id = auth.uid()) in ('admin', 'supervisor')
  )
  with check (
    (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'supervisor')
    or (select role from intern_users where id = auth.uid()) in ('admin', 'supervisor')
  );

create policy "intern_update_own_profile" on intern_users
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from intern_users where id = auth.uid())
  );

-- intern_tasks policies
drop policy if exists "intern_own_tasks" on intern_tasks;
create policy "intern_own_tasks" on intern_tasks for select to authenticated
  using (
    assigned_to = auth.uid()
    or (select role from intern_users where id = auth.uid()) in ('admin', 'supervisor')
  );

drop policy if exists "admin_manage_tasks" on intern_tasks;
create policy "admin_manage_tasks" on intern_tasks for all to authenticated
  using ((select role from intern_users where id = auth.uid()) in ('admin', 'supervisor'))
  with check ((select role from intern_users where id = auth.uid()) in ('admin', 'supervisor'));

create policy "intern_advance_own_task" on intern_tasks for update to authenticated
  using (assigned_to = auth.uid())
  with check (assigned_to = auth.uid());

-- intern_timesheets policies
drop policy if exists "intern_own_sheets" on intern_timesheets;
create policy "intern_own_sheets" on intern_timesheets for select to authenticated
  using (
    intern_id = auth.uid()
    or (select role from intern_users where id = auth.uid()) in ('admin', 'supervisor')
  );

create policy "intern_insert_sheet" on intern_timesheets for insert to authenticated
  with check (intern_id = auth.uid());

create policy "intern_update_pending" on intern_timesheets for update to authenticated
  using (intern_id = auth.uid() and status = 'pending')
  with check (intern_id = auth.uid());

drop policy if exists "admin_approve_sheets" on intern_timesheets;
create policy "admin_approve_sheets" on intern_timesheets for update to authenticated
  using ((select role from intern_users where id = auth.uid()) in ('admin', 'supervisor'));

-- intern_audit_logs policies
drop policy if exists "admin_read_logs" on intern_audit_logs;
create policy "admin_read_logs" on intern_audit_logs for select to authenticated
  using ((select role from intern_users where id = auth.uid()) in ('admin', 'supervisor'));

create policy "auth_insert_logs" on intern_audit_logs for insert to authenticated
  with check (true);

-- REALTIME
alter publication supabase_realtime add table intern_tasks;
alter publication supabase_realtime add table intern_timesheets;
alter publication supabase_realtime add table intern_audit_logs;
