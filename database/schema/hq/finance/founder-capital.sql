-- DestineVents Command Center — Founder Capital
-- Run this in Supabase → SQL Editor
-- RUN ORDER 3 OF 3: run financial-accounts.sql and cash-ledger.sql FIRST
--   (the FKs below reference both).
-- Tracks the founder's capital contributions and owner withdrawals. Single
-- founder (default "Miss Jenn"). Each entry also auto-creates a matching
-- cash_ledger row for the chosen account (handled in apps/hq/finance/founder.ts).
-- Net Owner Equity = total contributions − total withdrawals (computed).

create table if not exists founder_capital (
  id               bigint primary key default extract(epoch from now())::bigint,
  reference_no     text,                          -- auto FC-YYYY-NNN
  txn_date         date default now(),
  founder          text default 'Miss Jenn',
  transaction_type text not null default 'Capital Contribution', -- Capital Contribution | Owner Withdrawal
  amount           numeric not null default 0,
  account_id       bigint references financial_accounts (id),    -- account the cash moves through
  ledger_id        bigint references cash_ledger (id),           -- the auto-posted ledger row
  notes            text,
  created_at       timestamptz default now()
);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
alter table founder_capital enable row level security;

drop policy if exists "admin_only" on founder_capital;

create policy "admin_only" on founder_capital for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ─── REALTIME ────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'founder_capital'
  ) then
    alter publication supabase_realtime add table founder_capital;
  end if;
end $$;
