-- DestineVents Command Center — the four "Unpaid" rows from the 2026 spreadsheet
-- Run this in Supabase → SQL Editor. Safe to re-run (fixed ids; conflicts skip).
--
-- Why: these four sat in the Cash Ledger sheet marked "Unpaid", so they were
-- left out of import-2026-spreadsheet.sql — money owed is not money that moved.
-- They belong where they can age and be chased. Once one is actually settled,
-- Record Payment posts it to the Cash Ledger by itself; nothing here touches it.
--
-- Amounts come from the figures the spreadsheet wrote into the description
-- rather than the money columns. Preso for OWLS has no figure anywhere, so it
-- goes in at ₱0 and is flagged undisclosed.
--
-- Status is Draft, not Issued: these were never formally billed. Miss Jenn
-- issues the ones she wants to chase. Draft still counts toward Outstanding
-- Receivables (isOutstandingInvoice, apps/hq/finance/arCalc.ts) — correct, the
-- money is owed either way.
--
-- Nothing is written off. None of these is confirmed uncollectible, and
-- cancelling now would hide them; cancelling later is one dropdown.

-- ── Receivables — money owed TO DestineVents ──────────────────────────────────
-- Numbers continue from the highest OR-2026-NNN already in the table, so the
-- app's own auto-numbering (nextDocNumber) keeps flowing from there.
insert into invoices (id, or_num, client, amount, date, due, status, notes)
select
  v.id,
  'OR-2026-' || lpad((coalesce(m.highest, 0) + v.seq)::text, 3, '0'),
  v.client, v.amount, v.date, v.due, 'Draft', v.notes
from (values
    (20260301, 1, 'Session Groceries', 5000, '2026-05-20', '2026-06-19',
     'From the 2026 spreadsheet: "Session Groceries - AGRIPULSE Test App (P5000)", Team Fee, marked Unpaid. Amount taken from the description.'),
    (20260302, 2, 'CVAO', 2000, '2026-05-26', '2026-06-25',
     'From the 2026 spreadsheet: "CVAO Event (Prize (2000)", Team Fee, marked Unpaid. Amount taken from the description.'),
    (20260303, 3, 'OWLS', 0, '2026-03-02', '2026-04-01',
     'From the 2026 spreadsheet: "Preso for OWLS", Team Fee, marked Unpaid. AMOUNT UNDISCLOSED — no figure was recorded anywhere. Confirm with Josh and update.')
) as v (id, seq, client, amount, date, due, notes)
cross join (
  select max(substring(or_num from '^OR-2026-(\d+)$')::int) as highest
  from invoices where or_num ~ '^OR-2026-\d+$'
) as m
on conflict (id) do nothing;

-- ── Payables — money DestineVents owes ────────────────────────────────────────
-- SM Rambakan sat in the Money Out column while marked Unpaid, so this is a fee
-- still to be paid, not income to collect.
insert into bills
  (id, expense_number, payee, vendor, amount, date, due_date, category, ewt, status, remarks)
select
  20260401,
  'EXP-2026-' || lpad((coalesce(m.highest, 0) + 1)::text, 3, '0'),
  'SM Rambakan — PSA', 'SM Rambakan', 1100, '2026-03-03', '2026-04-02',
  'Freelancers', '0%', 'Pending',
  'From the 2026 spreadsheet: "SM Rambakan - PSA (P1100)", Team Fee, marked Unpaid, recorded in the Money Out column. Amount taken from the description.'
from (
  select max(substring(expense_number from '^EXP-2026-(\d+)$')::int) as highest
  from bills where expense_number ~ '^EXP-2026-\d+$'
) as m
on conflict (id) do nothing;

-- ── Check ─────────────────────────────────────────────────────────────────────
-- Expect three Draft invoices totalling ₱7,000.00 and one Pending bill at ₱1,100.00.
select 'receivable' as kind, or_num as ref, client as who, amount, status
from invoices where id in (20260301, 20260302, 20260303)
union all
select 'payable', expense_number, payee, amount, status
from bills where id = 20260401
order by kind, ref;
