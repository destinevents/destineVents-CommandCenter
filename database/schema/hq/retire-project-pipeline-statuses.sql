-- Retire 'Lead', 'Proposal Sent' and 'Active' as project statuses.
--
-- A project had two competing lists of statuses: the ones the edit form offered
-- (Lead, Proposal Sent, Proposal Approved, Active, Completed) and the ones the AR
-- Billing Pipeline used (Proposal Approved, Statement of Billing, Invoice,
-- Payment, Official Receipt, Completed). They met at only two values.
--
-- Three consequences, all now fixed in the app:
--   * Editing a project mid-billing found no matching option in the dropdown, so
--     the browser selected the first one — 'Lead' — and saving wrote that over
--     its real stage. Changing a project's notes could reset its billing.
--   * 'Lead' and 'Proposal Sent' were set by nothing and read by nothing. The
--     pre-win stages belong to the quotation, not the project it became.
--   * 'Active' was the only status the dashboard's Active Projects card counted,
--     yet it sat outside the pipeline — so the card read 0 while every project
--     was being invoiced, and marking one Active took it out of billing for good.
--
-- The pipeline is now the only lifecycle. Existing rows still carry the retired
-- values; left alone they would show a status that appears in no dropdown.
-- Moving them to 'Proposal Approved' puts them back at the point where they can
-- actually be billed.
--
-- Run this in Supabase -> SQL Editor. Safe to re-run.

-- ─── STEP 1: look first ───────────────────────────────────────────────────────
-- How many projects are on a retired status.

select status, count(*) as affected
  from public.projects
 where status in ('Lead', 'Proposal Sent', 'Active')
 group by status
 order by status;

-- ─── STEP 2: check before assuming they still need billing ────────────────────
-- An 'Active' project that was already receipted should go to 'Completed', not
-- back into the pipeline. This lists any that already have a paid invoice — if
-- it returns rows, complete those by hand (STEP 2b) before running STEP 3.

select p.id, p.name, p.value, sum(i.amount) as receipted
  from public.projects p
  join public.invoices i on i.project_id = p.id
 where p.status in ('Lead', 'Proposal Sent', 'Active')
   and i.status = 'Paid'
   and i.archived_at is null
 group by p.id, p.name, p.value;

-- ─── STEP 2b: only if STEP 2 returned rows ────────────────────────────────────
-- Uncomment and list the ids STEP 2 showed.
--
-- update public.projects
--    set status = 'Completed', updated_at = now()
--  where id in (/* ids from STEP 2 */);

-- ─── STEP 3: move the rest into the pipeline ──────────────────────────────────

update public.projects
   set status = 'Proposal Approved',
       updated_at = now()
 where status in ('Lead', 'Proposal Sent', 'Active');

-- ─── STEP 4: stop new rows landing on a retired status ────────────────────────
-- The column defaulted to 'Lead', which is no longer a status a project can hold.

alter table public.projects
  alter column status set default 'Proposal Approved';

-- ─── STEP 5: confirm ──────────────────────────────────────────────────────────
-- Re-run STEP 1. It should return no rows.
-- Every project should now be on one of the six pipeline stages:

select status, count(*)
  from public.projects
 group by status
 order by status;
