-- DestineVents Command Center — Cash Ledger (master transactions table)
-- Run this in Supabase → SQL Editor
-- RUN ORDER 2 OF 3: run financial-accounts.sql FIRST (FK below references it).
-- Every cash movement is one row here. Running balance per account is computed
-- client-side (never stored) — see apps/hq/finance/ledgerCalc.ts.
-- module_source distinguishes manual entries from auto-posted ones (e.g. Founder).

create table if not exists cash_ledger (
  id             bigint primary key default extract(epoch from now())::bigint,
  reference_no   text,                    -- auto CL-YYYY-NNN
  txn_date       date default now(),
  description    text not null,
  project_id     bigint,                  -- optional link to a project
  category       text,                    -- Income / Expense / Internal (see ledger.ts)
  module_source  text default 'Manual',   -- Manual | Founder | (future: AR/AP/Payroll)
  payment_method text,                    -- Cash | Bank Transfer | GCash | ...
  account_id     bigint not null references financial_accounts (id),
  cash_in        numeric default 0,
  cash_out       numeric default 0,
  created_by     text,
  attachment_url text,
  notes          text,
  created_at     timestamptz default now()
);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
alter table cash_ledger enable row level security;

drop policy if exists "admin_only" on cash_ledger;

create policy "admin_only" on cash_ledger for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ─── REALTIME ────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'cash_ledger'
  ) then
    alter publication supabase_realtime add table cash_ledger;
  end if;
end $$;
