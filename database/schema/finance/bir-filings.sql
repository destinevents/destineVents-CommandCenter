-- DestineVents Command Center — BIR Filing Records
-- Run this in Supabase → SQL Editor
-- Backs the Finance → BIR Reports tab: "verify amounts → save filing record" (handout §6)

create table if not exists bir_filings (
  id            bigint primary key default extract(epoch from now())::bigint,
  form          text not null,          -- 2551Q, 1701Q, 1604C, 2307
  period        text not null,          -- e.g. "Q2 2026" or "FY 2026"
  tax_base      numeric default 0,      -- gross receipts / net income / withholding base
  tax_due       numeric default 0,      -- verified tax paid on this filing
  reference_no  text,                   -- BIR confirmation / eFPS reference number
  notes         text,
  filed_at      date default now(),
  created_at    timestamptz default now()
);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
alter table bir_filings enable row level security;

drop policy if exists "admin_only" on bir_filings;

create policy "admin_only" on bir_filings for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ─── REALTIME ────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'bir_filings'
  ) then
    alter publication supabase_realtime add table bir_filings;
  end if;
end $$;
