-- PROPOSALS
create table if not exists proposals (
  id         bigint primary key default extract(epoch from now())::bigint,
  name       text not null,
  client     text,
  value      numeric default 0,
  sent       text,
  followup   text,
  status     text default 'Sent',
  created_at timestamptz default now()
);

alter table proposals enable row level security;

drop policy if exists "auth_all"   on proposals;
drop policy if exists "admin_only" on proposals;

create policy "admin_only" on proposals for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

alter publication supabase_realtime add table proposals;
