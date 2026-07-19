-- CLIENTS
create table if not exists clients (
  id          bigint primary key default extract(epoch from now())::bigint,
  name        text not null,
  type        text,
  brand       text,
  status      text default 'Lead',
  contact     text,
  email       text,
  total_value numeric default 0,
  created_at  timestamptz default now()
);

alter table clients enable row level security;

drop policy if exists "auth_all"   on clients;
drop policy if exists "admin_only" on clients;

-- Admin-only: interns/supervisors must not query HQ tables.
-- Uses public.current_user_role() (defined in icc/intern-schema.sql — run that first).
create policy "admin_only" on clients for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

alter publication supabase_realtime add table clients;
