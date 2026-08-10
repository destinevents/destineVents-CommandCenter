-- Operational runbook: change a person's role.
--
-- Replaces the old "Auth — promote user to admin" SQL Editor snippet, which
-- also wrote the role into auth.users.raw_user_meta_data. Do NOT do that: roles
-- in user_metadata are self-editable by the account holder, which was the
-- privilege-escalation hole closed in July 2026. intern_users.role is the only
-- source of truth, and public.current_user_role() is what every RLS policy
-- reads. Writing metadata now would resurrect a fixed vulnerability.
--
-- Since migration 017, signup creates every row as 'pending' and records what
-- the person asked for in requested_role. The normal way to set someone's role
-- is the admin UI (HQ -> Users, or ICC -> Interns -> Add Intern), which also
-- handles the invite email. Use this file for the cases the UI deliberately
-- won't do: granting 'admin', or fixing an account by hand.
-- Run in Supabase -> SQL Editor.

-- ─── STEP 1: confirm who you are about to change ─────────────────────────────

select id, name, email, role
  from intern_users
 where email = 'person@example.com';

-- ─── STEP 2: set the role ────────────────────────────────────────────────────
-- Allowed values, per config/roles.ts:
--   ICC portal : 'supervisor', 'intern'
--   HQ portal  : 'admin', 'finance_officer', 'external_accountant',
--                'team_staff', 'freelancer'
--   waiting    : 'pending'
-- The role alone decides which portal the person lands in — there is no
-- separate portal column.
-- The guard means a typo'd email changes nothing rather than the wrong person.

update intern_users
   set role = 'supervisor'
 where email = 'person@example.com'
   and role is distinct from 'supervisor';

-- ─── STEP 3: verify ──────────────────────────────────────────────────────────
-- Check the whole team, and confirm no stale role is still sitting in metadata.
-- metadata_role should read null for everyone; anything else is a leftover from
-- the pre-July-2026 scripts and can be cleared with STEP 4.

select iu.name,
       iu.email,
       iu.role                          as actual_role,
       au.raw_user_meta_data ->> 'role' as stale_metadata_role
  from intern_users iu
  join auth.users au on au.id = iu.id
 order by iu.role, iu.name;

-- ─── STEP 4 (optional): clear stale metadata roles ───────────────────────────
-- Only needed if STEP 3 shows a non-null stale_metadata_role. Nothing reads
-- this field any more, so removing it is safe and removes a misleading signal.

-- update auth.users
--    set raw_user_meta_data = raw_user_meta_data - 'role'
--  where raw_user_meta_data ? 'role';
