-- DestineVents Command Center — Financial Accounts
-- Run this in Supabase → SQL Editor
-- RUN ORDER 1 OF 3: financial-accounts -> cash-ledger -> founder-capital
--   (the later tables have foreign keys to this one — do not run out of order)
-- Backs Finance → Settings: the cash / bank / e-wallet accounts the Cash Ledger
-- posts into. Each account carries an opening balance; running balances are
-- computed on the fly from cash_ledger entries (never stored).

create table if not exists financial_accounts (
  id              bigint primary key default extract(epoch from now())::bigint,
  name            text not null,          -- e.g. "Cash on Hand", "BPI", "GCash"
  type            text not null default 'bank',  -- cash | bank | ewallet
  opening_balance numeric default 0,      -- starting balance at fresh start
  is_active       boolean default true,
  notes           text,
  created_at      timestamptz default now()
);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
alter table financial_accounts enable row level security;

drop policy if exists "admin_only" on financial_accounts;

create policy "admin_only" on financial_accounts for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ─── REALTIME ────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'financial_accounts'
  ) then
    alter publication supabase_realtime add table financial_accounts;
  end if;
end $$;
