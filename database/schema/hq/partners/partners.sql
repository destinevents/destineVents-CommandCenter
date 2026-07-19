-- PARTNERS
create table if not exists partners (
  id         bigint primary key default extract(epoch from now())::bigint,
  name       text not null,
  type       text,
  contact    text,
  email      text,
  created_at timestamptz default now()
);

alter table partners enable row level security;

drop policy if exists "auth_all"   on partners;
drop policy if exists "admin_only" on partners;

create policy "admin_only" on partners for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

alter publication supabase_realtime add table partners;
