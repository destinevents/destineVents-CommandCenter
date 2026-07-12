-- PATCH: Add Carlos Jul 6 entry (8h — Lead ICC Timesheet rollout)
-- Run once in Supabase → SQL Editor. Safe to re-run (no-op if row exists).

insert into intern_timesheets
  (intern_id, date, hours, activity_description, industry_category, skills, status, approved_by, approved_at)
select
  iu.id,
  date '2026-07-06',
  8.0,
  'Lead ICC Timesheet rollout — tested own Timelog input, ensured all interns can use it starting Tuesday',
  'Technology',
  array['Web Development','Backend Development','Communication'],
  'approved',
  (select id from intern_users where email = 'jenncastro@destinevents.biz' limit 1),
  now()
from intern_users iu
where iu.role = 'intern' and iu.name ilike '% carlos'
  and not exists (
    select 1 from intern_timesheets t
    where t.intern_id = iu.id and t.date = date '2026-07-06'
  );
