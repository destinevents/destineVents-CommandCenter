-- Two things to settle after linking. READ-ONLY — nothing changes.
--
-- 1. Abanao Square has two projects against one quotation (the double-conversion
--    loophole, which existed until 14 Aug 2026). One is real, one is a stray.
-- 2. DTI CAR never linked, so its project's name must differ from the
--    quotation's.

-- ─── A. The two Abanao projects, side by side ────────────────────────────────
-- Look at value, code and created_at, then decide which is the real one. The
-- older one is usually the original; the newer is usually the accidental
-- second press of "→ Project".
select
  pr.id,
  pr.code,
  pr.name,
  pr.client,
  pr.value,
  pr.status,
  pr.proposal_id,
  pr.created_at,
  (select count(*) from invoices i where i.project_id = pr.id)             as invoices,
  (select count(*) from statements_of_billing s where s.project_id = pr.id) as sobs,
  (select count(*) from cash_ledger cl where cl.project_id = pr.id)         as ledger_rows
from projects pr
where pr.name ilike '%Abanao%'
order by pr.created_at;

-- A project with invoices, SOBs or ledger rows against it is the one in real
-- use — keep that one, whatever its value says.


-- ─── B. Why DTI CAR did not link ─────────────────────────────────────────────
-- Compare the names exactly. A trailing space or a slightly different wording
-- is enough to stop the match.
select 'proposal' as side, id, quo_number as ref, name, value, total_amount
  from proposals where name ilike '%DTI%'
union all
select 'project'  as side, id, code       as ref, name, value, null
  from projects  where name ilike '%DTI%';


-- ─── C. Everything still unlinked ────────────────────────────────────────────
-- The full picture, so nothing else is quietly sitting unconnected.
select
  pr.id,
  pr.code,
  pr.name,
  pr.value,
  pr.created_at
from projects pr
where pr.proposal_id is null
order by pr.created_at;
