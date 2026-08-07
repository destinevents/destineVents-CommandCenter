-- One-off repair: put already-paid invoices onto the Cash Ledger.
--
-- Why this is needed: until Aug 7 2026 the PayMongo webhook marked an invoice
-- Paid without writing a Cash Ledger row, so invoices settled through a payment
-- link never reached the dashboard, Reports or the P&L. The same gap swallowed
-- any invoice marked paid while no financial account existed yet.
--
-- Run this in Supabase -> SQL Editor AFTER confirming Finance -> Settings has an
-- account flagged default. Safe to re-run: the NOT EXISTS guard means an invoice
-- that already has a ledger row is skipped, so nothing double-counts.
--
-- RUN STEP 1 FIRST and read the output. Only run step 2 if the list looks right.

-- ─── STEP 1: look before you leap ─────────────────────────────────────────────
-- Every paid, unarchived invoice with no ledger row behind it.

select i.id,
       i.or_num,
       i.client,
       i.amount,
       coalesce(i.payment_date, i.date) as will_be_dated,
       i.payment_method
  from invoices i
 where i.status = 'Paid'
   and i.archived_at is null
   and not exists (
         select 1 from cash_ledger cl
          where cl.source_type = 'invoice' and cl.source_id = i.id
       )
 order by coalesce(i.payment_date, i.date) nulls last;

-- ─── STEP 2: post them ────────────────────────────────────────────────────────
-- Column values deliberately match syncInvoiceToLedger (apps/hq/finance/ar/ar.ts)
-- and postInvoiceToLedger (api/payments/webhook.ts), so editing one of these
-- invoices in the app later leaves the row alone instead of rewriting it.

insert into cash_ledger (
  id, reference_no, txn_date, description, project_id, category,
  module_source, payment_method, account_id, cash_in, cash_out,
  created_by, source_type, source_id
)
select
  -- cash_ledger.id defaults to whole-second epoch time, so a multi-row insert
  -- would collide on the primary key. Offset each row to keep them unique.
  extract(epoch from now())::bigint + row_number() over (order by i.id),
  i.or_num,
  -- date and payment_date are text columns holding ISO dates. The regex guard
  -- skips free-text or blank values rather than failing the whole statement,
  -- and those rows fall back to today.
  coalesce(
    case when coalesce(i.payment_date, i.date) ~ '^\d{4}-\d{2}-\d{2}'
         then to_date(left(coalesce(i.payment_date, i.date), 10), 'YYYY-MM-DD')
    end,
    current_date
  ),
  'Client payment — ' || coalesce(i.client, 'Invoice')
    || case when i.or_num is not null then ' (' || i.or_num || ')' else '' end,
  i.project_id,
  'Client Payment',
  'AR',
  i.payment_method,
  (select a.id from financial_accounts a
    where a.is_default = true and a.is_active = true
    order by a.created_at asc limit 1),
  i.amount,
  0,
  i.received_by,
  'invoice',
  i.id
from invoices i
where i.status = 'Paid'
  and i.archived_at is null
  and not exists (
        select 1 from cash_ledger cl
         where cl.source_type = 'invoice' and cl.source_id = i.id
      )
  -- Refuse to post into nothing. If this returns no rows, no default account is
  -- set: fix that in Finance -> Settings first, then re-run.
  and exists (
        select 1 from financial_accounts a
         where a.is_default = true and a.is_active = true
      );

-- ─── STEP 3: confirm ──────────────────────────────────────────────────────────
-- Re-run STEP 1. It should now return no rows.
