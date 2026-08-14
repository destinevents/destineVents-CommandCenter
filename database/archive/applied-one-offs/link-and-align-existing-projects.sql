-- Connect the projects that already existed to the quotations they came from,
-- then make their values agree.
--
-- Why this is needed: migration 019 added projects.proposal_id but did not fill
-- it in, so every project created before 14 Aug 2026 has an empty link. The
-- app's value sync only fires when that link is present — which is why opening
-- and saving those projects appeared to do nothing at all.
--
-- Run the STEPs in order, reading the output of each before moving on.

-- ─── STEP 1 (read-only): which projects would be linked to which quotation ────
-- Matching is on name, because converting a quotation copies its name onto the
-- new project. Read this list and make sure each pairing is right.
select
  pr.id           as project_id,
  pr.name         as project_name,
  pr.value        as project_value,
  p.id            as proposal_id,
  p.quo_number,
  p.value         as proposal_value,
  p.total_amount  as proposal_total
from projects pr
join proposals p on lower(trim(p.name)) = lower(trim(pr.name))
where pr.proposal_id is null
order by pr.name;

-- ─── STEP 2 (read-only): anything ambiguous ──────────────────────────────────
-- A project whose name matches more than one quotation cannot be linked
-- automatically. If this returns rows, link those by hand rather than guessing.
select
  pr.id   as project_id,
  pr.name as project_name,
  count(p.id) as matching_quotations
from projects pr
join proposals p on lower(trim(p.name)) = lower(trim(pr.name))
where pr.proposal_id is null
group by pr.id, pr.name
having count(p.id) > 1;

-- ─── STEP 3: create the links ────────────────────────────────────────────────
-- Only where exactly one quotation matches, so nothing is guessed.
update projects pr
   set proposal_id = m.proposal_id
  from (
    select pr2.id as project_id, min(p.id) as proposal_id
      from projects pr2
      join proposals p on lower(trim(p.name)) = lower(trim(pr2.name))
     where pr2.proposal_id is null
     group by pr2.id
    having count(p.id) = 1
  ) m
 where pr.id = m.project_id;

-- ─── STEP 4: the project takes the quotation's value ─────────────────────────
-- For TEST Aurora Launch Night: the quotation is right, the project is wrong.
update projects pr
   set value = coalesce(nullif(p.total_amount, 0), p.value, 0),
       updated_at = now()
  from proposals p
 where p.id = pr.proposal_id
   and pr.name ilike 'TEST Aurora Launch Night'
   and coalesce(nullif(p.total_amount, 0), p.value, 0) > 0;

-- ─── STEP 5: the quotation takes the project's value ─────────────────────────
-- For Abanao Square and DTI CAR: the projects hold the real figures and the
-- quotations are still at 0. total_amount is set too, because the Proposals
-- page reads total_amount first and would otherwise keep showing ₱0.
update proposals p
   set value        = pr.value,
       total_amount = pr.value,
       subtotal     = pr.value,
       vat_amount   = 0
  from projects pr
 where pr.proposal_id = p.id
   and coalesce(p.total_amount, 0) = 0
   and coalesce(p.value, 0) = 0
   and pr.value > 0;

-- ─── STEP 6 (read-only): confirm they now agree ──────────────────────────────
select
  p.quo_number,
  p.name,
  p.value                                    as proposal_value,
  p.total_amount                             as proposal_total,
  pr.value                                   as project_value,
  case when p.value = pr.value then 'match' else 'STILL DIFFERENT' end as result
from proposals p
join projects pr on pr.proposal_id = p.id
order by p.quo_number;
