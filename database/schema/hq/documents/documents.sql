-- DOCUMENTS (metadata only — files stored in Supabase Storage)
create table if not exists documents (
  id         bigint primary key default extract(epoch from now())::bigint,
  name       text not null,
  type       text,
  size       text,
  date       text,
  url        text,
  path       text,
  created_at timestamptz default now()
);

alter table documents enable row level security;

drop policy if exists "auth_all"   on documents;
drop policy if exists "admin_only" on documents;

create policy "admin_only" on documents for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

alter publication supabase_realtime add table documents;
