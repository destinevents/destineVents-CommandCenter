-- DestineVents Command Center — Finance Integration (§7)
-- Run this in Supabase -> SQL Editor AFTER financial-accounts.sql, cash-ledger.sql
-- and founder-capital.sql have been applied.
--
-- Adds the plumbing that lets Accounts Receivable, Accounts Payable and Payroll
-- auto-post into the Cash Ledger:
--   * cash_ledger.source_type / source_id  -> links a ledger row back to the
--     invoice / bill / payroll run that created it (keeps posting idempotent and
--     reversible).
--   * financial_accounts.is_default        -> the account those modules post into.

alter table cash_ledger add column if not exists source_type text;
alter table cash_ledger add column if not exists source_id bigint;

create index if not exists cash_ledger_source_idx
  on cash_ledger (source_type, source_id);

alter table financial_accounts add column if not exists is_default boolean default false;

-- If exactly one account exists and none is flagged default yet, make it the
-- default so auto-posting works out of the box.
update financial_accounts
  set is_default = true
  where id = (
    select id from financial_accounts
    where is_active = true
    order by created_at asc
    limit 1
  )
  and not exists (select 1 from financial_accounts where is_default = true);
