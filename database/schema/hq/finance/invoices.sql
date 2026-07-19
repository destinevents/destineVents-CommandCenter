-- INVOICES (Accounts Receivable)
create table if not exists invoices (
  id         bigint primary key default extract(epoch from now())::bigint,
  or_num     text not null,
  client     text,
  amount     numeric default 0,
  date       text,
  due        text,
  status     text default 'Unpaid',
  created_at timestamptz default now()
);

alter table invoices enable row level security;

drop policy if exists "auth_all"   on invoices;
drop policy if exists "admin_only" on invoices;

create policy "admin_only" on invoices for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

alter publication supabase_realtime add table invoices;
