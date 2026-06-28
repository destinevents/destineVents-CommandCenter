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
  hours                numeric(4,1) check (hours >= 0.5 and hours <= 12) not null,
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

-- intern_users: everyone authenticated can read; only admin/supervisor can write
create policy "read_all_users"   on intern_users for select to authenticated using (true);
create policy "admin_write_users" on intern_users for all to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'supervisor'))
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'supervisor'));

-- intern_tasks: interns see only their own; admin/supervisor see all
create policy "intern_own_tasks" on intern_tasks for select to authenticated
  using (
    assigned_to = auth.uid()
    or (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'supervisor')
  );
create policy "admin_manage_tasks" on intern_tasks for all to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'supervisor'))
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'supervisor'));
create policy "intern_advance_own_task" on intern_tasks for update to authenticated
  using (assigned_to = auth.uid())
  with check (assigned_to = auth.uid());

-- intern_timesheets: interns see only their own; admin/supervisor see all
create policy "intern_own_sheets" on intern_timesheets for select to authenticated
  using (
    intern_id = auth.uid()
    or (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'supervisor')
  );
create policy "intern_insert_sheet" on intern_timesheets for insert to authenticated
  with check (intern_id = auth.uid());
create policy "intern_update_pending" on intern_timesheets for update to authenticated
  using (intern_id = auth.uid() and status = 'pending')
  with check (intern_id = auth.uid());
create policy "admin_approve_sheets" on intern_timesheets for update to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'supervisor'));

-- intern_audit_logs: read by admin/supervisor only; insert by authenticated
create policy "admin_read_logs" on intern_audit_logs for select to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'supervisor'));
create policy "auth_insert_logs" on intern_audit_logs for insert to authenticated
  with check (true);

-- REALTIME
alter publication supabase_realtime add table intern_tasks;
alter publication supabase_realtime add table intern_timesheets;
alter publication supabase_realtime add table intern_audit_logs;
