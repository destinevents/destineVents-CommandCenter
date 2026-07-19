-- BILLS (Accounts Payable)
create table if not exists bills (
  id         bigint primary key default extract(epoch from now())::bigint,
  payee      text not null,
  amount     numeric default 0,
  date       text,
  category   text,
  ewt        text default '0%',
  status     text default 'Unpaid',
  created_at timestamptz default now()
);

alter table bills enable row level security;

drop policy if exists "auth_all"   on bills;
drop policy if exists "admin_only" on bills;

create policy "admin_only" on bills for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

alter publication supabase_realtime add table bills;
