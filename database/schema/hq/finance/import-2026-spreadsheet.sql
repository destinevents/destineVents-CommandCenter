-- DestineVents Command Center — import of "destine vents_Finances 2026.xlsx"
-- Run this in Supabase → SQL Editor. Safe to re-run (ids are fixed; conflicts skip).
-- RUN ledger-company.sql FIRST — this file writes to cash_ledger.company.
--
-- Source: Josh's 2026 finance workbook, Cash Ledger + CASH LEDGER SUMMARY sheets
-- merged. The two sheets had drifted apart: the summary held two June entries
-- (UC intern lunch ₱1,500 and snacks ₱200) that the main ledger was missing.
-- Both are included below.
--
-- 32 cash entries: ₱24,081.00 in, ₱22,105.50 out, net ₱1,975.50.
--
-- Cleaned on the way in:
--   · "Affilate Sales" -> "Affiliate Sales", "Founder  Expenses" -> "Founder Expenses"
--   · the old Project column split into company (the business) and project (the job)
--   · payment method left blank — the spreadsheet never recorded it
--
-- NOT imported — these were marked "Unpaid", so they are money owed, not cash
-- that moved. They belong in Receivables as invoices, not in the ledger:
--   2026-03-02  Preso for OWLS  (amount not filled in)
--   2026-03-03  SM Rambakan - PSA (P1100)  (₱1,100.00)
--   2026-05-20  Session Groceries - AGRIPULSE Test App (P5000)  (amount not filled in)
--   2026-05-26  CVAO Event (Prize (2000)  (amount not filled in)
-- Three of the four wrote the amount into the description instead of the money
-- columns. The fourth (SM Rambakan, ₱1,100) sat in the Money Out column while
-- marked unpaid, which overstated expenses by ₱1,100. Confirm the direction of
-- all four with Miss Jenn before raising them as receivables.

do $$
declare
  acct_id bigint;
begin
  select id into acct_id from financial_accounts where is_default and is_active order by id limit 1;
  if acct_id is null then
    select id into acct_id from financial_accounts where is_active order by id limit 1;
  end if;
  if acct_id is null then
    raise exception 'No financial account found — create one in Finance → Settings first';
  end if;

  insert into cash_ledger
    (id, reference_no, txn_date, description, company, project_id, category,
     module_source, payment_method, account_id, cash_in, cash_out, created_by, notes)
  values
    (20260001, 'CL-2026-001', '2026-01-24', 'ILAW - Roxas School - Mural fee PSA', 'DestineVents', (select id from projects where name ilike 'ILAW%' limit 1), 'Founder Expenses', 'Manual', null, acct_id, 0, 3000, '2026 spreadsheet import', 'Spreadsheet project: ILAW'),
    (20260002, 'CL-2026-002', '2026-02-08', 'SM Blooming Weaves', 'DestineVents', null, 'Team Expenses', 'Manual', null, acct_id, 0, 400, '2026 spreadsheet import', null),
    (20260003, 'CL-2026-003', '2026-02-11', 'Flea By the People', 'DestineVents', null, 'Team Expenses', 'Manual', null, acct_id, 0, 400, '2026 spreadsheet import', null),
    (20260004, 'CL-2026-004', '2026-02-23', 'De Stilj event - Intern exposure', 'DestineVents', (select id from projects where name ilike 'Highland Wedding%' limit 1), 'Team Expenses', 'Manual', null, acct_id, 0, 400, '2026 spreadsheet import', 'Spreadsheet project: Highland Wedding'),
    (20260005, 'CL-2026-005', '2026-02-28', 'Fashion Show', 'DestineVents', (select id from projects where name ilike 'Highland Wedding%' limit 1), 'Team Expenses', 'Manual', null, acct_id, 0, 1000, '2026 spreadsheet import', 'Spreadsheet project: Highland Wedding'),
    (20260006, 'CL-2026-006', '2026-03-01', 'Born in Film Coor from Manila - Probono', 'DestineVents', (select id from projects where name ilike 'BORN in Film%' limit 1), 'Team Expenses', 'Manual', null, acct_id, 0, 600, '2026 spreadsheet import', 'Spreadsheet project: BORN in Film'),
    (20260007, 'CL-2026-007', '2026-03-04', 'DTI Elip Mag', 'DestineVents', null, 'Team Fee', 'Manual', null, acct_id, 5000, 0, '2026 spreadsheet import', 'Paid'),
    (20260008, 'CL-2026-008', '2026-03-05', 'DTI Elip Mag', 'DestineVents', null, 'Team Expenses', 'Manual', null, acct_id, 0, 1800, '2026 spreadsheet import', null),
    (20260009, 'CL-2026-009', '2026-03-06', 'SM Event - destilj - Intern Exposure', 'DestineVents', null, 'Team Expenses', 'Manual', null, acct_id, 0, 600, '2026 spreadsheet import', null),
    (20260010, 'CL-2026-010', '2026-03-27', 'Abanao Easter event', 'DestineVents', null, 'Team Fee', 'Manual', null, acct_id, 1000, 0, '2026 spreadsheet import', 'Paid'),
    (20260011, 'CL-2026-011', '2026-03-28', 'Abanao Easter event', 'DestineVents', null, 'Team Fee', 'Manual', null, acct_id, 3000, 0, '2026 spreadsheet import', 'Paid'),
    (20260012, 'CL-2026-012', '2026-04-05', 'Abanao Easter event', 'DestineVents', null, 'Team Expenses', 'Manual', null, acct_id, 0, 1500, '2026 spreadsheet import', null),
    (20260013, 'CL-2026-013', '2026-04-11', 'Destine vents', 'DestineVents', null, 'Team Expenses', 'Manual', null, acct_id, 0, 2240, '2026 spreadsheet import', null),
    (20260014, 'CL-2026-014', '2026-04-23', 'Digital Brew - Launch - Monica', 'Disenyo Digitals', null, 'Team Fee', 'Manual', null, acct_id, 0, 1000, '2026 spreadsheet import', null),
    (20260015, 'CL-2026-015', '2026-04-24', 'Digital Brew - Launch', 'Disenyo Digitals', null, 'Affiliate Fee', 'Manual', null, acct_id, 0, 500, '2026 spreadsheet import', null),
    (20260016, 'CL-2026-016', '2026-04-25', 'Digital Brew - Sales', 'Disenyo Digitals', null, 'Affiliate Sales', 'Manual', null, acct_id, 916, 0, '2026 spreadsheet import', null),
    (20260017, 'CL-2026-017', '2026-04-26', 'Digital Brew - Sales', 'Disenyo Digitals', null, 'Affiliate Sales', 'Manual', null, acct_id, 1620, 0, '2026 spreadsheet import', null),
    (20260018, 'CL-2026-018', '2026-05-04', 'DOST Cordinnovation', 'Disenyo Digitals', null, 'Team Fee', 'Manual', null, acct_id, 11545, 0, '2026 spreadsheet import', null),
    (20260019, 'CL-2026-019', '2026-05-04', 'DOST Cordinnovation - Josh', 'Disenyo Digitals', null, 'Team Expenses', 'Manual', null, acct_id, 0, 1000, '2026 spreadsheet import', null),
    (20260020, 'CL-2026-020', '2026-05-23', 'Amianan Meet up Collab', 'DestineVents', null, 'Team Expenses', 'Manual', null, acct_id, 0, 600, '2026 spreadsheet import', null),
    (20260021, 'CL-2026-021', '2026-05-26', 'CVAO Event - Josh', 'DestineVents', null, 'Team Expenses', 'Manual', null, acct_id, 0, 1100, '2026 spreadsheet import', null),
    (20260022, 'CL-2026-022', '2026-05-29', 'DTI Expo for JFC', 'DestineVents', null, 'Founder Expenses', 'Manual', null, acct_id, 0, 500, '2026 spreadsheet import', null),
    (20260023, 'CL-2026-023', '2026-05-29', 'DTI Expo for Josh', 'DestineVents', null, 'Team Fee', 'Manual', null, acct_id, 0, 500, '2026 spreadsheet import', null),
    (20260024, 'CL-2026-024', '2026-05-30', 'DTI Expo for INV8', 'DestineVents', null, 'Team Fee', 'Manual', null, acct_id, 0, 1000, '2026 spreadsheet import', null),
    (20260025, 'CL-2026-025', '2026-05-30', 'DTI Expo for JFC', 'DestineVents', null, 'Founder Expenses', 'Manual', null, acct_id, 0, 500, '2026 spreadsheet import', null),
    (20260026, 'CL-2026-026', '2026-05-30', 'DTI Expo for Josh', 'DestineVents', null, 'Team Expenses', 'Manual', null, acct_id, 0, 500, '2026 spreadsheet import', null),
    (20260027, 'CL-2026-027', '2026-06-06', 'AYA Event Three', 'DestineVents', null, 'Team Expenses', 'Manual', null, acct_id, 0, 300, '2026 spreadsheet import', null),
    (20260028, 'CL-2026-028', '2026-06-06', 'AYA Event Three - Web page Fee', 'DestineVents', null, 'Team Fee', 'Manual', null, acct_id, 1000, 0, '2026 spreadsheet import', null),
    (20260029, 'CL-2026-029', '2026-06-11', 'AYA-Sip Meetup', 'Disenyo Digitals', null, 'Team Expenses', 'Manual', null, acct_id, 0, 700, '2026 spreadsheet import', 'JFC hours: 2'),
    (20260030, 'CL-2026-030', '2026-06-11', 'UC Intern onboarding Snacks', 'Disenyo Digitals', null, 'Team Expenses', 'Manual', null, acct_id, 0, 265.5, '2026 spreadsheet import', 'JFC hours: 6'),
    (20260031, 'CL-2026-031', '2026-06-16', 'UC Intern onboarding Lunch', 'Disenyo Digitals', null, 'Team Expenses', 'Manual', null, acct_id, 0, 1500, '2026 spreadsheet import', null),
    (20260032, 'CL-2026-032', '2026-06-24', 'UC Intern onboarding Snacks', 'Disenyo Digitals', null, 'Team Expenses', 'Manual', null, acct_id, 0, 200, '2026 spreadsheet import', null)
  on conflict (id) do nothing;
end $$;

-- Check: should return 32 rows, 24081 in, 22105.5 out.
select count(*) as entries, sum(cash_in) as total_in, sum(cash_out) as total_out
from cash_ledger where created_by = '2026 spreadsheet import';
