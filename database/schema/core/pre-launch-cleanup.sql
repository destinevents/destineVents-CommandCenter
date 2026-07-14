-- PRE-LAUNCH-CLEANUP.SQL
-- Wipes TEST DATA before seeding the real timesheet history for the Jul 7 launch.
--
-- Run order for launch: 1) everyone signs up → 2) THIS script →
-- 3) seed-timesheet-history.sql. Running the seed before this cleanup would
-- let leftover test entries on Jun 20 – Jul 1 dates block the real hours
-- (the seed skips intern+date combos that already have an entry).
--
-- SCOPE — deletes ALL rows from: intern_timesheets, intern_tasks,
-- intern_notifications, intern_audit_logs.
-- NEVER touches intern_users or auth.users — all accounts (and their real
-- emails) are kept exactly as they are.
--
-- Run SECTION A first, alone, and eyeball what will be deleted.
-- Then run SECTION B. (The SQL editor runs a paste as one transaction —
-- run the sections as separate pastes.)

-- ============================ SECTION A: INSPECT ============================
-- What's currently in the DB (nothing is deleted by this section).

select 'intern_users (KEPT)' as what, count(*) as rows from intern_users
union all select 'intern_timesheets (deleted)', count(*) from intern_timesheets
union all select 'intern_tasks (deleted)',      count(*) from intern_tasks
union all select 'intern_notifications (deleted)', count(*) from intern_notifications
union all select 'intern_audit_logs (deleted)', count(*) from intern_audit_logs;

select iu.name, t.date, t.hours, t.status, left(t.activity_description, 60) as activity
from intern_timesheets t
join intern_users iu on iu.id = t.intern_id
order by iu.name, t.date;

select iu.name as assigned_to, k.title, k.status, k.due_date
from intern_tasks k
left join intern_users iu on iu.id = k.assigned_to
order by k.created_at;

-- ============================ SECTION B: WIPE ===============================
-- Approved timesheets and reviewed tasks are hard-locked by the enforcement
-- triggers (by design), so the triggers are disabled for the wipe and
-- re-enabled immediately after. State rules stay fully enforced for the app.

alter table intern_timesheets disable trigger enforce_timesheet_rules;
alter table intern_tasks      disable trigger enforce_task_rules;

delete from intern_timesheets;     -- first: references intern_tasks(task_id)
delete from intern_tasks;
delete from intern_notifications;
delete from intern_audit_logs;

alter table intern_timesheets enable trigger enforce_timesheet_rules;
alter table intern_tasks      enable trigger enforce_task_rules;

-- Verify: data tables empty, triggers back on ('O' = enabled), accounts kept
select 'intern_timesheets' as t, count(*) from intern_timesheets
union all select 'intern_tasks', count(*) from intern_tasks
union all select 'intern_notifications', count(*) from intern_notifications
union all select 'intern_audit_logs', count(*) from intern_audit_logs
union all select 'intern_users (kept)', count(*) from intern_users;

select tgname, tgenabled from pg_trigger
where tgname in ('enforce_timesheet_rules', 'enforce_task_rules');
