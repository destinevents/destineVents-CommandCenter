-- SEED-TIMESHEET-HISTORY.SQL
-- Run ONCE in Supabase → SQL Editor (safe to re-run; no rollback inside).
--
-- Seeds the reallocated BSIT intern timesheet history (Jun 20 – Jul 1, 2026)
-- from BSIT_Intern_Timesheet_Reallocated.xlsx / BSIT_Intern_Timesheet_Reference.pdf
-- ahead of the July 7 launch:
--   1. adds intern_users.required_hours and sets the six interns' totals
--   2. inserts 52 approved timesheet entries (approved_by = Jenn) — one per
--      intern per day; days already logged are skipped, so interns who sign
--      up later just need this script re-run
--   3. creates the six July 6 assignments as 'assigned' tasks
--   4. verification: rendered totals must be 83.5 / 74 / 77 / 69 / 56 / 61
--      and remaining 266.5 / 276 / 173 / 281 / 144 / 139
--
-- Zero-hour days from the sheet (e.g. De Ocampo Jun 25) are omitted — the
-- hours check constraint requires 0.5–10. Interns are matched by surname
-- pattern against intern_users.name; anyone without an account yet is
-- reported by the NOTICE block and silently skipped by the inserts.

-- 1. Required hours -----------------------------------------------------------
alter table intern_users add column if not exists required_hours integer;

update intern_users iu
set required_hours = v.req
from (values
  ('%mercado%', 350),
  ('%ante%',    350),
  ('%miranda%', 250),
  ('%carlos%',  350),
  ('%ocampo%',  200),
  ('%bernabe%', 200)
) as v(pat, req)
where iu.role = 'intern' and iu.name ilike v.pat;

-- 2. Report interns who have not signed up yet --------------------------------
do $$
declare
  pat text;
begin
  foreach pat in array array['%mercado%','%ante%','%miranda%','%carlos%','%ocampo%','%bernabe%'] loop
    if not exists (select 1 from intern_users where role = 'intern' and name ilike pat) then
      raise notice 'No intern account matching "%": their rows are SKIPPED — re-run this script after they sign up.', pat;
    end if;
  end loop;
  if not exists (select 1 from intern_users where email = 'jenncastro@destinevents.biz') then
    raise notice 'Admin jenncastro@destinevents.biz not found — approved_by will be NULL.';
  end if;
end $$;

-- 3. Timesheet history (status approved, approved_by = Jenn) ------------------
with admin_user as (
  select id from intern_users where email = 'jenncastro@destinevents.biz' limit 1
),
entries(pat, date, hours, activity, category, skills) as (values
  -- Derick Myles Mercado — total 83.5
  ('%mercado%', date '2026-06-20', 9.0, 'Weekend at asyouare Baguio Event [Moved from Jun 11: Onboarding at UC Library / DOST]', 'Events', array['Communication']),
  ('%mercado%', date '2026-06-21', 9.0, 'Sunday work for Edits [Moved from Jun 12: Onboarding Emails / Comms]', 'Marketing', array['Content Creation','Communication']),
  ('%mercado%', date '2026-06-22', 9.0, 'asyouare Baguio Landing page + affiliate marketing [Moved from Jun 15: Tasks 1 Activated]', 'Technology', array['Web Development']),
  ('%mercado%', date '2026-06-23', 9.0, 'Individual challenge of tasks [Moved from Jun 16: Team tasks at DOST]', 'Operations', array['Problem Solving','Communication']),
  ('%mercado%', date '2026-06-24', 9.0, 'DOST Meet up [Moved from Jun 17: asyouare Baguio site / ticketing]', 'Technology', array['Web Development','Communication']),
  ('%mercado%', date '2026-06-25', 9.0, '30min discussion with JFC [Moved from Jun 18: asyouare Baguio site / ticketing]', 'Technology', array['Web Development']),
  ('%mercado%', date '2026-06-26', 9.0, 'Session Groceries Reels [Moved from Jun 19: asyouare Baguio site / ticketing]', 'Technology', array['Web Development']),
  ('%mercado%', date '2026-06-29', 9.0, 'DICT', 'Events', array['Communication']),
  ('%mercado%', date '2026-06-30', 9.0, 'DICT', 'Events', array['Communication']),
  ('%mercado%', date '2026-07-01', 2.5, 'Off with excuse (partial hours)', 'Operations', array['Communication']),

  -- Mary Keirstin Marzie Ante — total 74
  ('%ante%', date '2026-06-20', 9.0, 'Weekend at asyouare Baguio Event [Moved from Jun 11: Onboarding at UC Library / DOST]', 'Events', array['Communication']),
  ('%ante%', date '2026-06-21', 9.0, 'Sunday work for Edits [Moved from Jun 12: Onboarding Emails / Comms]', 'Marketing', array['Content Creation','Communication']),
  ('%ante%', date '2026-06-22', 9.0, 'asyouare Baguio Landing page [Moved from Jun 15: Tasks 1 Activated]', 'Technology', array['Web Development']),
  ('%ante%', date '2026-06-23', 9.0, 'Individual challenge of tasks [Moved from Jun 16: Team tasks at DOST]', 'Operations', array['Problem Solving','Communication']),
  ('%ante%', date '2026-06-24', 9.0, 'DOST Meet up [Moved from Jun 17: asyouare Baguio site / ticketing] — Review of Analytics (IG & FB), Bot Automation (Meta), and Content Planning', 'Marketing', array['Automation','Content Creation']),
  ('%ante%', date '2026-06-25', 9.0, '30min discussion with JFC [Moved from Jun 18: asyouare Baguio site / ticketing] — Session Groceries Reel 1, Storyboard for AI Reel Concept, Friday''s Content Preparation + 20 mins Audio Call with Ms. Jenn; additional task aside from SMM: AYA Landing Page and Creatives'' Portfolio', 'Marketing', array['Content Creation','Video Editing']),
  ('%ante%', date '2026-06-26', 4.0, 'Session Groceries Reels [Moved from Jun 19: asyouare Baguio site / ticketing] — Finalization on AYA Landing Page, Content Creators + Student Leader''s Portfolio V1, and Digital ID (+1 hour)', 'Design', array['Graphic Design','Web Development']),
  ('%ante%', date '2026-06-29', 8.0, 'DICT + IPPOHL', 'Events', array['Communication']),
  ('%ante%', date '2026-06-30', 8.0, 'DICT + Session Groceries', 'Events', array['Communication','Content Creation']),

  -- Christian Joseph Miranda — total 77
  ('%miranda%', date '2026-06-20', 9.0, 'Weekend at asyouare Baguio Event [Moved from Jun 11: Onboarding at UC Library / DOST]', 'Events', array['Communication']),
  ('%miranda%', date '2026-06-21', 9.0, 'Sunday work for Edits [Moved from Jun 12: Onboarding Emails / Comms]', 'Marketing', array['Content Creation','Communication']),
  ('%miranda%', date '2026-06-22', 9.0, 'asyouare Baguio Landing page [Moved from Jun 15: Tasks 1 Activated]', 'Technology', array['Web Development']),
  ('%miranda%', date '2026-06-23', 9.0, 'Individual challenge of tasks [Moved from Jun 16: Team tasks at DOST]', 'Operations', array['Problem Solving','Communication']),
  ('%miranda%', date '2026-06-24', 9.0, 'DOST Meet up [Moved from Jun 17: asyouare Baguio site / ticketing]', 'Technology', array['Web Development','Communication']),
  ('%miranda%', date '2026-06-25', 9.0, '30min discussion with JFC [Moved from Jun 18: asyouare Baguio site / ticketing]', 'Technology', array['Web Development']),
  ('%miranda%', date '2026-06-26', 7.0, 'Session Groceries Reels [Moved from Jun 19: asyouare Baguio site / ticketing]', 'Marketing', array['Video Editing','Content Creation']),
  ('%miranda%', date '2026-06-29', 8.0, 'DICT + IPPOHL', 'Events', array['Communication']),
  ('%miranda%', date '2026-06-30', 8.0, 'DICT + Session Groceries', 'Events', array['Communication','Content Creation']),

  -- Jhon Gabriel Carlos — total 69
  ('%carlos%', date '2026-06-20', 9.0, 'Weekend at asyouare Baguio Event [Moved from Jun 11: Onboarding at UC Library / DOST]', 'Events', array['Communication']),
  ('%carlos%', date '2026-06-21', 9.0, 'Sunday work for Edits [Moved from Jun 12: Onboarding Emails / Comms]', 'Marketing', array['Content Creation','Communication']),
  ('%carlos%', date '2026-06-22', 6.0, 'asyouare Baguio Landing page [Moved from Jun 15: Tasks 1 Activated] — Deployed the new landing page of AYA', 'Technology', array['Web Development','Problem Solving']),
  ('%carlos%', date '2026-06-23', 7.0, 'Individual challenge of tasks [Moved from Jun 16: Team tasks at DOST] — Worked on my assigned task. MVP Planning', 'Technology', array['Problem Solving','Communication']),
  ('%carlos%', date '2026-06-24', 6.0, 'DOST Meet up [Moved from Jun 17: asyouare Baguio site / ticketing]', 'Technology', array['Web Development','Communication']),
  ('%carlos%', date '2026-06-25', 8.0, '30min discussion with JFC [Moved from Jun 18: asyouare Baguio site / ticketing] — Worked on the paymongo integration', 'Technology', array['Backend Development','Problem Solving']),
  ('%carlos%', date '2026-06-26', 8.0, 'Timesheet backend with Gab [Moved from Jun 19: asyouare Baguio site / ticketing] — Debugged and worked on the HQ Command Center; Sorted the sponsors to put on the Database', 'Technology', array['Backend Development','Debugging','Database Design']),
  ('%carlos%', date '2026-06-29', 8.0, 'DICT + IPPOHL', 'Events', array['Communication']),
  ('%carlos%', date '2026-06-30', 8.0, 'DICT + Session Groceries', 'Events', array['Communication','Content Creation']),

  -- Jose Allan De Ocampo — total 56 (Jun 25 was 0h in the sheet: omitted)
  ('%ocampo%', date '2026-06-20', 9.0, 'Weekend at asyouare Baguio Event [Moved from Jun 11: Onboarding at UC Library / DOST]', 'Events', array['Communication']),
  ('%ocampo%', date '2026-06-21', 9.0, 'Sunday work for Edits [Moved from Jun 12: Onboarding Emails / Comms]', 'Marketing', array['Video Editing','Content Creation']),
  ('%ocampo%', date '2026-06-22', 9.0, 'asyouare Baguio Landing page [Moved from Jun 15: Tasks 1 Activated]', 'Technology', array['Web Development']),
  ('%ocampo%', date '2026-06-23', 9.0, 'Individual challenge of tasks [Moved from Jun 16: Team tasks at DOST]', 'Operations', array['Problem Solving','Communication']),
  ('%ocampo%', date '2026-06-24', 5.0, 'DOST Meet up [Moved from Jun 17: asyouare Baguio site / ticketing]', 'Technology', array['Web Development','Communication']),
  ('%ocampo%', date '2026-06-26', 7.0, 'Session Groceries Reels [Moved from Jun 19: asyouare Baguio site / ticketing]', 'Marketing', array['Video Editing','Content Creation']),
  ('%ocampo%', date '2026-06-29', 8.0, 'DICT + IPPOHL', 'Events', array['Communication']),

  -- Ethan Wilvic Bernabe — total 61
  ('%bernabe%', date '2026-06-20', 9.0, 'Weekend at asyouare Baguio Event [Moved from Jun 11: Onboarding at UC Library / DOST]', 'Events', array['Communication']),
  ('%bernabe%', date '2026-06-21', 9.0, 'Sunday work for Edits [Moved from Jun 12: Onboarding Emails / Comms]', 'Marketing', array['Video Editing','Content Creation']),
  ('%bernabe%', date '2026-06-22', 9.0, 'asyouare Baguio Landing page [Moved from Jun 15: Tasks 1 Activated]', 'Technology', array['Web Development']),
  ('%bernabe%', date '2026-06-23', 9.0, 'Individual challenge of tasks [Moved from Jun 16: Team tasks at DOST]', 'Operations', array['Problem Solving','Communication']),
  ('%bernabe%', date '2026-06-24', 9.0, 'DOST Meet up [Moved from Jun 17: asyouare Baguio site / ticketing]', 'Technology', array['Web Development','Communication']),
  ('%bernabe%', date '2026-06-25', 1.0, '30min discussion with JFC [Moved from Jun 18: asyouare Baguio site / ticketing]', 'Operations', array['Communication']),
  ('%bernabe%', date '2026-06-26', 7.0, 'Session Groceries Reels [Moved from Jun 19: asyouare Baguio site / ticketing]', 'Marketing', array['Video Editing','Content Creation']),
  ('%bernabe%', date '2026-06-29', 8.0, 'DICT + IPPOHL', 'Events', array['Communication'])
)
insert into intern_timesheets
  (intern_id, date, hours, activity_description, industry_category, skills, status, approved_by, approved_at)
select iu.id, e.date, e.hours, e.activity, e.category, e.skills,
       'approved', (select id from admin_user), now()
from entries e
join intern_users iu on iu.role = 'intern' and iu.name ilike e.pat
where not exists (
  select 1 from intern_timesheets t
  where t.intern_id = iu.id and t.date = e.date
);

-- 4. July 6 assignments as tasks (status must start 'assigned') ---------------
with admin_user as (
  select id from intern_users where email = 'jenncastro@destinevents.biz' limit 1
),
tasks(pat, title, description, priority, due_date, category, output_type, skills) as (values
  ('%mercado%', 'AYA website re-brand + Chimichanga data entry',
   'Quick edit of the AYA website — use Ms Monica''s branding kit, remove the dark green feels. Then continue Chimichanga right away: input all 3 pages from the xls (HO to be given; pull in Gab if you need an extra hand).',
   'high', date '2026-07-08', 'Technology', 'landing_page', array['Web Development','Graphic Design']),
  ('%ante%', 'SOCMED calendar + asyouare profiles',
   'Insta call Monday to walk through the SOCMED calendar (discuss if it should be endorsed to CJ). Work on the asyouare profiles — make sure Mon, Josh and Jan''s profiles are complete.',
   'high', date '2026-07-07', 'Marketing', 'design', array['Content Creation','Communication']),
  ('%carlos%', 'Lead ICC Timesheet rollout',
   'Lead the Timesheet: test your own Timelog input on July 6 using the Timesheet xls / given HO and ensure everyone can use it starting Tuesday. Lead the progress of this. May pick up the affiliate marketing plan from Kei.',
   'high', date '2026-07-07', 'Technology', 'code', array['Web Development','Backend Development','Communication']),
  ('%ocampo%', 'Session Groceries 6-minute video',
   'Produce the 6-minute Session Groceries video — ample time given, storytelling format.',
   'high', date '2026-07-07', 'Marketing', 'video', array['Video Editing','Content Creation']),
  ('%miranda%', 'Socmed QR end-slides + schedule with Kei',
   'Revisit all socmed contents made by you + Kei and ensure every end slide has the Session Groceries QR page. Work with Kei to cleanly plot the socmed schedule to endorse to SesGro.',
   'medium', date '2026-07-08', 'Marketing', 'design', array['Graphic Design','Content Creation']),
  ('%bernabe%', 'CapCut reels exploration',
   'Explore more reels capability using CapCut — see brief: https://docs.google.com/document/d/14mxmMNUIpHBnUgdaRZ7LKG25dQSulLXt6EF0eaR0chM/edit?usp=sharing',
   'medium', date '2026-07-10', 'Marketing', 'video', array['Video Editing','Content Creation'])
)
insert into intern_tasks
  (title, description, assigned_to, assigned_by, priority, status, due_date, industry_category, output_type, skills)
select t.title, t.description, iu.id, (select id from admin_user),
       t.priority, 'assigned', t.due_date, t.category, t.output_type, t.skills
from tasks t
join intern_users iu on iu.role = 'intern' and iu.name ilike t.pat
where not exists (
  select 1 from intern_tasks x
  where x.assigned_to = iu.id and x.title = t.title
);

-- 5. Verification --------------------------------------------------------------
-- Expected: Mercado 83.5/266.5, Ante 74/276, Miranda 77/173, Carlos 69/281,
-- De Ocampo 56/144, Bernabe 61/139 — and six 'assigned' Jul-6 tasks.
select iu.name,
       iu.required_hours,
       coalesce(sum(t.hours), 0)                       as rendered_hours,
       iu.required_hours - coalesce(sum(t.hours), 0)   as remaining_hours
from intern_users iu
left join intern_timesheets t on t.intern_id = iu.id and t.status = 'approved'
where iu.role = 'intern'
group by iu.id, iu.name, iu.required_hours
order by iu.name;

select iu.name, k.title, k.status, k.due_date
from intern_tasks k
join intern_users iu on iu.id = k.assigned_to
where k.status = 'assigned'
order by iu.name;
