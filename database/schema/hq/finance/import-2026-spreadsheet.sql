-- DestineVents Command Center — import of "destine vents_Finances 2026.xlsx"
-- Run this in Supabase → SQL Editor. Safe to re-run (fixed ids; conflicts skip).
-- RUN ledger-company.sql FIRST — this writes to cash_ledger.company.
--
-- One statement on purpose: a failure shows as a red error rather than a block
-- that quietly rolls back. The account is looked up inline — the default active
-- one, else any active one.
--
-- Source: Josh's 2026 workbook, Cash Ledger + CASH LEDGER SUMMARY merged. The
-- two sheets had drifted apart; the summary held two June entries (UC intern
-- lunch ₱1,500, snacks ₱200) the main ledger was missing. Both are here.
--
-- 32 cash entries: ₱24,081.00 in, ₱22,105.50 out, net ₱1,975.50.
--
-- Cleaned on the way in:
--   · "Affilate Sales" -> "Affiliate Sales", "Founder  Expenses" -> "Founder Expenses"
--   · the old Project column split into company (the business) and project (the job)
--   · payment method left blank — the spreadsheet never recorded it
--   · project left blank, with the spreadsheet's project name kept in Notes: ILAW,
--     Highland Wedding and BORN in Film are not HQ projects yet. Link them by hand
--     once they exist, or tell Gab and the import can match them by name.
--
-- NOT imported — marked "Unpaid", so this is money owed, not cash that moved.
-- These belong in Receivables as invoices:
--   2026-03-02  Preso for OWLS  (amount not filled in)
--   2026-03-03  SM Rambakan - PSA (P1100)  (₱1,100.00)
--   2026-05-20  Session Groceries - AGRIPULSE Test App (P5000)  (amount not filled in)
--   2026-05-26  CVAO Event (Prize (2000)  (amount not filled in)
-- Three of the four wrote the amount into the description instead of the money
-- columns. The fourth (SM Rambakan, ₱1,100) sat in Money Out while marked unpaid,
-- overstating expenses by ₱1,100. Confirm all four with Miss Jenn.

insert into cash_ledger
  (id, reference_no, txn_date, description, company, project_id, category,
   module_source, payment_method, account_id, cash_in, cash_out, created_by, notes)
select
  v.id, v.reference_no, v.txn_date::date, v.description, v.company, null, v.category,
  'Manual', null, a.id, v.cash_in, v.cash_out, '2026 spreadsheet import', v.notes
from (values
    (20260001, 'CL-2026-001', '2026-01-24', 'ILAW - Roxas School - Mural fee PSA', 'DestineVents', 'Founder Expenses', 0, 3000, 'Spreadsheet project: ILAW'),
    (20260002, 'CL-2026-002', '2026-02-08', 'SM Blooming Weaves', 'DestineVents', 'Team Expenses', 0, 400, null),
    (20260003, 'CL-2026-003', '2026-02-11', 'Flea By the People', 'DestineVents', 'Team Expenses', 0, 400, null),
    (20260004, 'CL-2026-004', '2026-02-23', 'De Stilj event - Intern exposure', 'DestineVents', 'Team Expenses', 0, 400, 'Spreadsheet project: Highland Wedding'),
    (20260005, 'CL-2026-005', '2026-02-28', 'Fashion Show', 'DestineVents', 'Team Expenses', 0, 1000, 'Spreadsheet project: Highland Wedding'),
    (20260006, 'CL-2026-006', '2026-03-01', 'Born in Film Coor from Manila - Probono', 'DestineVents', 'Team Expenses', 0, 600, 'Spreadsheet project: BORN in Film'),
    (20260007, 'CL-2026-007', '2026-03-04', 'DTI Elip Mag', 'DestineVents', 'Team Fee', 5000, 0, 'Paid'),
    (20260008, 'CL-2026-008', '2026-03-05', 'DTI Elip Mag', 'DestineVents', 'Team Expenses', 0, 1800, null),
    (20260009, 'CL-2026-009', '2026-03-06', 'SM Event - destilj - Intern Exposure', 'DestineVents', 'Team Expenses', 0, 600, null),
    (20260010, 'CL-2026-010', '2026-03-27', 'Abanao Easter event', 'DestineVents', 'Team Fee', 1000, 0, 'Paid'),
    (20260011, 'CL-2026-011', '2026-03-28', 'Abanao Easter event', 'DestineVents', 'Team Fee', 3000, 0, 'Paid'),
    (20260012, 'CL-2026-012', '2026-04-05', 'Abanao Easter event', 'DestineVents', 'Team Expenses', 0, 1500, null),
    (20260013, 'CL-2026-013', '2026-04-11', 'Destine vents', 'DestineVents', 'Team Expenses', 0, 2240, null),
    (20260014, 'CL-2026-014', '2026-04-23', 'Digital Brew - Launch - Monica', 'Disenyo Digitals', 'Team Fee', 0, 1000, null),
    (20260015, 'CL-2026-015', '2026-04-24', 'Digital Brew - Launch', 'Disenyo Digitals', 'Affiliate Fee', 0, 500, null),
    (20260016, 'CL-2026-016', '2026-04-25', 'Digital Brew - Sales', 'Disenyo Digitals', 'Affiliate Sales', 916, 0, null),
    (20260017, 'CL-2026-017', '2026-04-26', 'Digital Brew - Sales', 'Disenyo Digitals', 'Affiliate Sales', 1620, 0, null),
    (20260018, 'CL-2026-018', '2026-05-04', 'DOST Cordinnovation', 'Disenyo Digitals', 'Team Fee', 11545, 0, null),
    (20260019, 'CL-2026-019', '2026-05-04', 'DOST Cordinnovation - Josh', 'Disenyo Digitals', 'Team Expenses', 0, 1000, null),
    (20260020, 'CL-2026-020', '2026-05-23', 'Amianan Meet up Collab', 'DestineVents', 'Team Expenses', 0, 600, null),
    (20260021, 'CL-2026-021', '2026-05-26', 'CVAO Event - Josh', 'DestineVents', 'Team Expenses', 0, 1100, null),
    (20260022, 'CL-2026-022', '2026-05-29', 'DTI Expo for JFC', 'DestineVents', 'Founder Expenses', 0, 500, null),
    (20260023, 'CL-2026-023', '2026-05-29', 'DTI Expo for Josh', 'DestineVents', 'Team Fee', 0, 500, null),
    (20260024, 'CL-2026-024', '2026-05-30', 'DTI Expo for INV8', 'DestineVents', 'Team Fee', 0, 1000, null),
    (20260025, 'CL-2026-025', '2026-05-30', 'DTI Expo for JFC', 'DestineVents', 'Founder Expenses', 0, 500, null),
    (20260026, 'CL-2026-026', '2026-05-30', 'DTI Expo for Josh', 'DestineVents', 'Team Expenses', 0, 500, null),
    (20260027, 'CL-2026-027', '2026-06-06', 'AYA Event Three', 'DestineVents', 'Team Expenses', 0, 300, null),
    (20260028, 'CL-2026-028', '2026-06-06', 'AYA Event Three - Web page Fee', 'DestineVents', 'Team Fee', 1000, 0, null),
    (20260029, 'CL-2026-029', '2026-06-11', 'AYA-Sip Meetup', 'Disenyo Digitals', 'Team Expenses', 0, 700, 'JFC hours: 2'),
    (20260030, 'CL-2026-030', '2026-06-11', 'UC Intern onboarding Snacks', 'Disenyo Digitals', 'Team Expenses', 0, 265.5, 'JFC hours: 6'),
    (20260031, 'CL-2026-031', '2026-06-16', 'UC Intern onboarding Lunch', 'Disenyo Digitals', 'Team Expenses', 0, 1500, null),
    (20260032, 'CL-2026-032', '2026-06-24', 'UC Intern onboarding Snacks', 'Disenyo Digitals', 'Team Expenses', 0, 200, null)
) as v (id, reference_no, txn_date, description, company, category, cash_in, cash_out, notes)
cross join (
  select id from financial_accounts
  where is_active order by is_default desc, id limit 1
) as a
on conflict (id) do nothing;

-- Should return 32 / 24081 / 22105.5. If it returns 0 rows, the insert
-- above found no active account in financial_accounts.
select count(*) as entries, sum(cash_in) as total_in, sum(cash_out) as total_out
from cash_ledger where created_by = '2026 spreadsheet import';
