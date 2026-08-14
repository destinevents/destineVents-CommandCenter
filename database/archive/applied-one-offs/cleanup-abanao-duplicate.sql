-- Clean up after the duplicate-project loophole.
--
-- Abanao Square ended up with two projects against QUO-2026-001:
--
--   PRJ-2026-001  ₱5,000  created 6 Aug 2026   <- the original
--   PRJ-2026-003    ₱500  created 14 Aug 2026  <- accidental second conversion
--
-- Neither has invoices, SOBs or ledger rows, so nothing is attached to either
-- and removing the stray one loses no financial record.
--
-- The quotation currently reads ₱500 because link-and-align-existing-projects
-- copied a value across while both projects were linked, and the database chose
-- the wrong one of the two. This puts it back to ₱5,000.
--
-- BEFORE RUNNING: confirm ₱5,000 is what the Abanao Square Easter Event was
-- actually worth. Everything below assumes it is.

-- ─── STEP 1 (read-only): last look before deleting ───────────────────────────
select
  pr.id, pr.code, pr.name, pr.value, pr.created_at,
  (select count(*) from invoices i               where i.project_id  = pr.id) as invoices,
  (select count(*) from statements_of_billing s  where s.project_id  = pr.id) as sobs,
  (select count(*) from cash_ledger cl           where cl.project_id = pr.id) as ledger_rows
from projects pr
where pr.id in (1786024112, 1786714388)
order by pr.created_at;

-- Every count above must be 0. If any is not, STOP and say so — that project
-- is carrying real financial records and must not be deleted.


-- ─── STEP 2: remove the accidental duplicate ─────────────────────────────────
-- PRJ-2026-003, created today by a second press of "→ Project".
delete from projects
 where id = 1786714388
   and not exists (select 1 from invoices              i  where i.project_id  = 1786714388)
   and not exists (select 1 from statements_of_billing s  where s.project_id  = 1786714388)
   and not exists (select 1 from cash_ledger           cl where cl.project_id = 1786714388);


-- ─── STEP 3: put the quotation back to the original project's figure ─────────
update proposals
   set value        = 5000,
       total_amount = 5000,
       subtotal     = 5000,
       vat_amount   = 0
 where quo_number = 'QUO-2026-001';


-- ─── STEP 4 (read-only): confirm ─────────────────────────────────────────────
select
  p.quo_number,
  p.name,
  p.value      as quotation_value,
  pr.code      as project_code,
  pr.value     as project_value,
  case when p.value = pr.value then 'match' else 'STILL DIFFERENT' end as result
from proposals p
join projects pr on pr.proposal_id = p.id
where p.quo_number = 'QUO-2026-001';


-- ─────────────────────────────────────────────────────────────────────────────
-- DTI CAR (QUO-2026-002) is not touched here. It has no project, so there is no
-- figure to recover — the amount has to be entered by someone who knows it.
-- Open the quotation in HQ, add a line item, and save; the value will then be
-- recorded properly and any project made from it will inherit the figure.
-- ─────────────────────────────────────────────────────────────────────────────
