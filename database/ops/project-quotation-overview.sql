-- Every project and quotation in one result, so nothing is clipped by the
-- Supabase editor showing only the last statement's output.
--
-- READ-ONLY. Run the whole file; it is a single query.
--
-- Read the `note` column first:
--   duplicate project  -> more than one project against the same quotation
--   no project         -> quotation was never converted
--   unlinked project   -> project exists but is not connected to a quotation
--   value mismatch     -> linked, but the two figures disagree
--   ok                 -> linked and matching

select
  coalesce(p.quo_number, '—')                       as quotation,
  coalesce(p.name, pr.name)                         as name,
  p.value                                           as quotation_value,
  p.total_amount                                    as quotation_total,
  pr.id                                             as project_id,
  pr.code                                           as project_code,
  pr.value                                          as project_value,
  pr.created_at                                     as project_created,
  coalesce((select count(*) from invoices i               where i.project_id  = pr.id), 0) as invoices,
  coalesce((select count(*) from statements_of_billing s  where s.project_id  = pr.id), 0) as sobs,
  coalesce((select count(*) from cash_ledger cl           where cl.project_id = pr.id), 0) as ledger_rows,
  case
    when pr.id is null then 'no project'
    when p.id  is null then 'unlinked project'
    when (select count(*) from projects x where x.proposal_id = p.id) > 1 then 'duplicate project'
    when coalesce(p.value, 0) <> coalesce(pr.value, 0) then 'value mismatch'
    else 'ok'
  end                                               as note
from proposals p
full outer join projects pr on pr.proposal_id = p.id
order by note, quotation, pr.created_at;
