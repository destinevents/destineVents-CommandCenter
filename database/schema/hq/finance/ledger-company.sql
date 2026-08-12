-- DestineVents Command Center — Cash Ledger: company column
-- Run this in Supabase → SQL Editor. Safe to re-run.
--
-- Why: the 2026 finance spreadsheet tracked "Project" as a mix of two different
-- things — real projects (ILAW, Highland Wedding, BORN in Film) and the company
-- the money belonged to (destine vents, disenyo digitals). Those are separate
-- questions, so they get separate columns: `company` for which business the cash
-- belongs to, `project_id` for which job it was for.

alter table cash_ledger
  add column if not exists company text;

comment on column cash_ledger.company is
  'Which business the cash belongs to — DestineVents | Disenyo Digitals | AYA. Free text; see APP_SETTINGS.finance.companies.';

-- Backfill: existing rows predate multi-company tracking and are all DestineVents.
update cash_ledger set company = 'DestineVents' where company is null;

create index if not exists cash_ledger_company_idx on cash_ledger (company);
