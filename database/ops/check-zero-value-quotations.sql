-- Why do quotations show ₱0, and can the real figure be recovered?
--
-- The Proposals table shows `total_amount || value`, so a row reading ₱0 has
-- zero (or null) in BOTH columns. There are two possible reasons, and they need
-- different answers:
--
--   A. Line items exist but the totals were never written back to the proposal.
--      Recoverable — the money is in proposal_line_items and can be added up.
--
--   B. No line items either. Nothing to recover; the figures were never
--      captured and someone has to type them in.
--
-- This file is READ-ONLY. Run it in Supabase -> SQL Editor and read query 2:
-- that is the one that tells you which case you are in.

-- 1. Every quotation and what it currently claims to be worth.
select
  id,
  quo_number,
  name,
  client,
  status,
  value,
  subtotal,
  vat_amount,
  total_amount
from proposals
order by quo_number;

-- 2. THE DECIDING QUERY — what the line items say each quotation is worth.
--    A row here with recoverable_total > 0 is case A and can be repaired.
--    No rows at all means case B: the line items were never entered.
select
  p.id,
  p.quo_number,
  p.name,
  p.value                                as stored_value,
  p.total_amount                         as stored_total,
  count(li.id)                           as line_items,
  sum(li.quantity * li.unit_price)       as recoverable_subtotal,
  sum(li.quantity * li.unit_price * li.vat_rate / 100.0) as recoverable_vat,
  sum(li.quantity * li.unit_price * (1 + li.vat_rate / 100.0)) as recoverable_total
from proposals p
join proposal_line_items li on li.proposal_id = p.id
where coalesce(p.total_amount, 0) = 0
  and coalesce(p.value, 0) = 0
group by p.id, p.quo_number, p.name, p.value, p.total_amount
order by p.quo_number;


-- ─────────────────────────────────────────────────────────────────────────────
-- THE REPAIR — only if query 2 returned rows (case A). Read the figures first.
--
-- update proposals p
--    set subtotal     = t.sub,
--        vat_amount   = t.vat,
--        total_amount = t.sub + t.vat,
--        value        = t.sub + t.vat
--   from (
--     select li.proposal_id,
--            sum(li.quantity * li.unit_price)                        as sub,
--            sum(li.quantity * li.unit_price * li.vat_rate / 100.0)  as vat
--       from proposal_line_items li
--      group by li.proposal_id
--   ) t
--  where t.proposal_id = p.id
--    and coalesce(p.total_amount, 0) = 0
--    and coalesce(p.value, 0) = 0;
--
-- If query 2 returned NOTHING, this repair cannot help — open each quotation,
-- enter its line items, and save. The app now refuses to save one worth ₱0,
-- so it cannot silently happen again.
--
-- Either way, a Won quotation's project was created carrying the same ₱0, so
-- check Projects afterwards and correct the project value too.
-- ─────────────────────────────────────────────────────────────────────────────
