-- Paid-date tracking for expenses and payroll.
--
-- Why: the "Paid This Month" stat cards were counting the wrong date. Expenses
-- counted `bills.date` (the date the supplier put on their bill) and payroll
-- counted `created_at` (when the draft was typed up). Neither is the date the
-- money actually left, so marking a back-dated document as paid never moved the
-- current month's card.
--
-- Both columns are nullable: existing rows keep working and the app falls back
-- to the old field until they are backfilled.
--
-- Safe to re-run.

alter table public.bills
  add column if not exists paid_at date;

comment on column public.bills.paid_at is
  'Date the expense was actually settled. Drives the "Paid This Month" card and the Cash Ledger posting date. Null for rows created before this migration.';

alter table public.payroll_runs
  add column if not exists released_at date;

comment on column public.payroll_runs.released_at is
  'Date the payslip was released to the employee. Drives the payroll "Paid This Month" card. Null for rows created before this migration.';

-- Backfill from the best available proxy so historical figures stay put rather
-- than dropping out of the month cards entirely.
--
-- `bills.date` is a text column, not a date, so it needs an explicit cast. The
-- ::text + left(...,10) shape below reads the leading YYYY-MM-DD out of either a
-- text column or a real date/timestamp one, so this runs regardless of how each
-- column was originally declared. The regex guard skips anything that is not an
-- ISO date (blanks, free-text like "Jul 5", legacy junk) instead of failing the
-- whole migration on one bad row.
update public.bills
   set paid_at = to_date(left(bills.date::text, 10), 'YYYY-MM-DD')
 where status = 'Paid'
   and paid_at is null
   and bills.date is not null
   and bills.date::text ~ '^\d{4}-\d{2}-\d{2}';

update public.payroll_runs
   set released_at = to_date(left(payroll_runs.created_at::text, 10), 'YYYY-MM-DD')
 where status = 'Paid'
   and released_at is null
   and payroll_runs.created_at is not null
   and payroll_runs.created_at::text ~ '^\d{4}-\d{2}-\d{2}';

-- Month-bucket lookups for the stat cards.
create index if not exists bills_paid_at_idx        on public.bills (paid_at);
create index if not exists payroll_runs_released_at_idx on public.payroll_runs (released_at);
