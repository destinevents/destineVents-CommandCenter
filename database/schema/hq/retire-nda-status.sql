-- Retire the "NDA Signed" status.
--
-- The NDA is being dropped from HQ entirely: the intake wizard that generated it,
-- the dashboard stat card that counted signed NDAs, and "NDA Signed" as a status
-- on both clients and projects.
--
-- Existing records still carry that status. Left alone they would display a status
-- that no longer appears in any dropdown, so anyone editing one would be forced to
-- silently change it. Moving them to 'Active' treats a signed NDA as work that was
-- genuinely underway.
--
-- Run this in Supabase -> SQL Editor. Safe to re-run.

-- ─── STEP 1: look first ───────────────────────────────────────────────────────
-- How many records are affected, and on which table.

select 'clients' as table_name, count(*) as affected
  from public.clients  where status = 'NDA Signed'
union all
select 'projects', count(*)
  from public.projects where status = 'NDA Signed';

-- ─── STEP 2: move them ────────────────────────────────────────────────────────

update public.clients
   set status = 'Active'
 where status = 'NDA Signed';

update public.projects
   set status = 'Active'
 where status = 'NDA Signed';

-- ─── STEP 3: confirm ──────────────────────────────────────────────────────────
-- Re-run STEP 1. Both counts should be 0.
