-- Are any invoices stuck on the legacy 'Unpaid' status?
--
-- QA counter-check, Test 04. 'Unpaid' predates the Draft -> Issued -> Paid
-- lifecycle. The table still defaults to it, and doc-state-machine.sql has no
-- transition out of it — so an invoice carrying that status can never reach
-- Paid, and the money can never be recorded against it.
--
-- This file is READ-ONLY. It changes nothing. Run it in Supabase -> SQL Editor
-- and read the result before deciding anything; the fix is at the bottom,
-- commented out.

-- 1. How many invoices sit on each status.
select
  coalesce(status, '(null)') as status,
  count(*)                   as invoices,
  sum(amount)                as total_amount
from invoices
group by 1
order by 2 desc;

-- 2. The stuck ones in detail, if there are any.
select
  id,
  or_num,
  client,
  amount,
  status,
  date,
  created_at
from invoices
where status is null
   or status = 'Unpaid'
order by created_at;


-- ─────────────────────────────────────────────────────────────────────────────
-- THE FIX — read the results above first, then uncomment ONE of these.
--
-- Either way, change the column default so no new row lands on 'Unpaid' again:
--
--   alter table invoices alter column status set default 'Draft';
--
-- If query 2 returned NO rows, the default change above is all that is needed.
--
-- If query 2 DID return rows, move them onto the live lifecycle first. 'Issued'
-- means "sent to the client, awaiting payment", which is what 'Unpaid' meant —
-- and Issued can reach Paid, which is the point.
--
--   update invoices
--      set status = 'Issued'
--    where status is null or status = 'Unpaid';
--
-- Do NOT move them straight to 'Paid'. That would post cash to the ledger for
-- money that may never have arrived.
-- ─────────────────────────────────────────────────────────────────────────────
