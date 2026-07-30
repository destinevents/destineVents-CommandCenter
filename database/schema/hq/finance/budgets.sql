-- DestineVents Command Center — Budget Planner (§1)
-- Run this in Supabase -> SQL Editor (no dependency order — standalone table).
-- Stores a planned budget amount per expense category for a period (a whole
-- year, or a specific month). "Actual" is computed live from the Cash Ledger,
-- never stored here.

create table if not exists budgets (
  id            bigint primary key default extract(epoch from now())::bigint,
  category      text not null,
  period_year   int  not null,
  period_month  int,                 -- null = annual budget; 1-12 = monthly
  amount        numeric not null default 0,
  notes         text,
  created_at    timestamptz default now()
);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
alter table budgets enable row level security;

drop policy if exists "finance_write" on budgets;
drop policy if exists "finance_read" on budgets;

-- Admin + Finance may create/edit/delete; Management + External Accountant read.
create policy "finance_write" on budgets for all to authenticated
  using (public.current_user_role() in ('admin', 'finance_officer'))
  with check (public.current_user_role() in ('admin', 'finance_officer'));

create policy "finance_read" on budgets for select to authenticated
  using (public.current_user_role() in ('admin', 'finance_officer', 'supervisor', 'external_accountant'));

-- ─── REALTIME ────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'budgets'
  ) then
    alter publication supabase_realtime add table budgets;
  end if;
end $$;
