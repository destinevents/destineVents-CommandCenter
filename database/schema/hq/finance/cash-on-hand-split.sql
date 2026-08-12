-- DestineVents Command Center — split the 2026 history into Cash on Hand
-- Run this in Supabase → SQL Editor, AFTER import-2026-spreadsheet.sql.
-- Safe to re-run: fixed ids, conflicts skip, and the update is scoped by category.
--
-- Why: every imported entry landed in GCash, because entries post to whichever
-- account is flagged default. So the cards read Cash on Hand ₱0 / E-wallet
-- ₱7,978.50, when in fact the snacks, transport and event costs were paid in
-- cash out of pocket.
--
-- The rule applied here: costs incurred on the ground (Team Expenses, Founder
-- Expenses — ₱19,105.50 over 21 entries) were cash. Fees paid to people
-- (Team Fee out ₱2,500, Affiliate Fee ₱500) were transfers and stay in GCash.
-- The spreadsheet never recorded payment method, so this is a considered guess:
-- correcting any single row afterwards is one Edit in the Cash Ledger.
--
-- Total cash is unchanged at ₱7,978.50 — this only says where it sits.

-- ── 1. The account ────────────────────────────────────────────────────────────
insert into financial_accounts (id, name, type, opening_balance, is_active, notes)
values (20260100, 'Cash on Hand', 'cash', 0, true,
        'Physical cash. Created when the 2026 spreadsheet was split out of GCash.')
on conflict (id) do nothing;

-- ── 2. Move the out-of-pocket entries ─────────────────────────────────────────
update cash_ledger
set account_id = 20260100
where created_by = '2026 spreadsheet import'
  and category in ('Team Expenses', 'Founder Expenses');

-- ── 3. Fund it ────────────────────────────────────────────────────────────────
-- Cash had to come out of GCash before it could be spent, and the spreadsheet
-- never recorded those withdrawals. One reconstructed withdrawal per month,
-- each covering that month's cash spend, dated its first cash expense.
-- Category 'Transfer' is internal (see INTERNAL_CATEGORIES in ledgerCalc.ts), so
-- these never touch revenue, expenses or the P&L — they only move money.
insert into cash_ledger
  (id, reference_no, txn_date, description, company, category, module_source,
   payment_method, account_id, cash_in, cash_out, created_by, notes)
select
  v.id, v.reference_no, v.txn_date::date, v.description, 'DestineVents', 'Transfer',
  'Manual', null,
  case when v.side = 'from' then src.id else 20260100 end,
  v.cash_in, v.cash_out, '2026 spreadsheet import',
  'Reconstructed: the spreadsheet recorded the spending but not the withdrawal.'
from (values
    -- January ₱3,000.00
    (20260201, 'CL-2026-T01', '2026-01-24', 'Cash withdrawn for operations — January',   'from',     0, 3000),
    (20260202, 'CL-2026-T01', '2026-01-24', 'Cash received for operations — January',    'to',    3000,    0),
    -- February ₱2,200.00
    (20260203, 'CL-2026-T02', '2026-02-08', 'Cash withdrawn for operations — February',  'from',     0, 2200),
    (20260204, 'CL-2026-T02', '2026-02-08', 'Cash received for operations — February',   'to',    2200,    0),
    -- March ₱3,000.00
    (20260205, 'CL-2026-T03', '2026-03-01', 'Cash withdrawn for operations — March',     'from',     0, 3000),
    (20260206, 'CL-2026-T03', '2026-03-01', 'Cash received for operations — March',      'to',    3000,    0),
    -- April ₱3,740.00
    (20260207, 'CL-2026-T04', '2026-04-05', 'Cash withdrawn for operations — April',     'from',     0, 3740),
    (20260208, 'CL-2026-T04', '2026-04-05', 'Cash received for operations — April',      'to',    3740,    0),
    -- May ₱4,200.00
    (20260209, 'CL-2026-T05', '2026-05-04', 'Cash withdrawn for operations — May',       'from',     0, 4200),
    (20260210, 'CL-2026-T05', '2026-05-04', 'Cash received for operations — May',        'to',    4200,    0),
    -- June ₱2,965.50
    (20260211, 'CL-2026-T06', '2026-06-06', 'Cash withdrawn for operations — June',      'from',     0, 2965.5),
    (20260212, 'CL-2026-T06', '2026-06-06', 'Cash received for operations — June',       'to',    2965.5,   0)
) as v (id, reference_no, txn_date, description, side, cash_in, cash_out)
cross join (
  -- the account the imported entries currently sit in: GCash
  select id from financial_accounts
  where is_active and id <> 20260100 order by is_default desc, id limit 1
) as src
on conflict (id) do nothing;

-- ── Check ─────────────────────────────────────────────────────────────────────
-- Expect: Cash on Hand ₱0.00, GCash ₱7,978.50, total ₱7,978.50.
select
  a.name,
  a.type,
  a.opening_balance + coalesce(sum(l.cash_in - l.cash_out), 0) as balance
from financial_accounts a
left join cash_ledger l on l.account_id = a.id
where a.is_active
group by a.id, a.name, a.type, a.opening_balance
order by a.name;
