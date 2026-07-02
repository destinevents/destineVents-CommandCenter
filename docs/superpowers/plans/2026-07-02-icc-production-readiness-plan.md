# ICC Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the two critical bugs and set up Jenn's admin account so the intern team can use ICC day-to-day.

**Architecture:** All three fixes are SQL-only changes applied in the Supabase SQL editor. The local `database/schema/intern-schema.sql` is updated after each fix to stay in sync with what's deployed. No JS or TS files change.

**Tech Stack:** Supabase (PostgreSQL, RLS, triggers), Supabase SQL Editor, live app at https://destine-vents-command-center.vercel.app

## Global Constraints

- No JS/TS code changes — every fix is pure SQL
- After each SQL editor run, `database/schema/intern-schema.sql` must be updated to match what was deployed
- All verification steps are done against the live deployed app and live Supabase project
- Jenn's email is `destinevents.biz@gmail.com`

---

### Task 1: Fix intern name trigger + backfill existing rows

**Files:**
- Modify: `database/schema/intern-schema.sql` — line 80 (the `coalesce` inside the trigger function)

**Interfaces:**
- Produces: trigger `handle_new_intern_user` that reads `name` first, then `full_name`, then falls back to the email prefix

- [ ] **Step 1: Run the trigger fix in the Supabase SQL editor**

Go to your Supabase dashboard → SQL Editor and run:

```sql
create or replace function handle_new_intern_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into intern_users (id, name, email, role)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(new.email, '@', 1)
    ),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'role', 'intern')
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;
```

Expected output: `Success. No rows returned.`

- [ ] **Step 2: Run the data migration to fix existing rows**

```sql
update intern_users iu
set name = coalesce(
  (au.raw_user_meta_data ->> 'name'),
  (au.raw_user_meta_data ->> 'full_name'),
  iu.name
)
from auth.users au
where iu.id = au.id
  and iu.name = split_part(iu.email, '@', 1)
  and (
    au.raw_user_meta_data ->> 'name' is not null
    or au.raw_user_meta_data ->> 'full_name' is not null
  );
```

Expected output: `X rows affected` (one per intern whose name was the email prefix). If `0 rows affected` — no existing bad data, that's fine too.

- [ ] **Step 3: Verify existing rows look correct**

```sql
select name, email from intern_users order by created_at;
```

Expected: every row shows a real name (e.g. `John Doe`), not an email prefix (e.g. `john.doe`).

- [ ] **Step 4: Verify new signups get the right name**

Sign up a new test account at `/signup.html` on the live app. Fill in a real full name. Then run in the SQL editor:

```sql
select name, email from intern_users order by created_at desc limit 1;
```

Expected: `name` column shows the name entered during signup, not the email prefix. Delete the test account afterward: Supabase dashboard → Authentication → Users → delete.

- [ ] **Step 5: Update intern-schema.sql to match what's deployed**

In `database/schema/intern-schema.sql`, replace line 80:

```sql
-- BEFORE (line 80):
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
```

```sql
-- AFTER:
    coalesce(
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(new.email, '@', 1)
    ),
```

- [ ] **Step 6: Commit**

```bash
git add database/schema/intern-schema.sql
git commit -m "fix: patch intern user trigger to read 'name' metadata key from signup"
```

---

### Task 2: Add RLS policy so interns can update their own profile

**Files:**
- Modify: `database/schema/intern-schema.sql` — insert after line 105 (after the `admin_write_users` policy block)

**Interfaces:**
- Consumes: existing `intern_users` table with RLS already enabled
- Produces: new policy `intern_update_own_profile` — interns can UPDATE their own row but the `with check` prevents changing their own `role`

- [ ] **Step 1: Run the new policy in the Supabase SQL editor**

```sql
create policy "intern_update_own_profile" on intern_users
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from intern_users where id = auth.uid())
  );
```

Expected output: `Success. No rows returned.`

- [ ] **Step 2: Verify the policy was created**

```sql
select policyname, cmd
from pg_policies
where tablename = 'intern_users'
order by policyname;
```

Expected: three rows — `admin_write_users`, `intern_update_own_profile`, `read_all_users`.

- [ ] **Step 3: Test that an intern can save their profile**

Log in as an intern at the live app (`/intern.html`) → Account Settings → change the Name or School field → click Save. Then run in the SQL editor:

```sql
select name, school, program from intern_users where email = '<the-intern-email>';
```

Expected: the database values match what was entered in the form. Before this fix they would have stayed unchanged.

- [ ] **Step 4: Update intern-schema.sql to match what's deployed**

In `database/schema/intern-schema.sql`, add the new policy immediately after the `admin_write_users` block (after line 105):

```sql
create policy "intern_update_own_profile" on intern_users
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from intern_users where id = auth.uid())
  );
```

- [ ] **Step 5: Commit**

```bash
git add database/schema/intern-schema.sql
git commit -m "fix: add RLS policy so interns can update their own profile"
```

---

### Task 3: Set Jenn's account as admin

**Files:**
- None — one-time SQL only, no code files change

**Interfaces:**
- Consumes: existing `intern_users` and `auth.users` rows for `destinevents.biz@gmail.com`
- Produces: Jenn's account with `role = 'admin'` in both tables so her session JWT carries the correct claim

- [ ] **Step 1: Confirm Jenn has signed up**

Run in the SQL editor:

```sql
select id, name, email, role from intern_users where email = 'destinevents.biz@gmail.com';
```

Expected: one row with `role = 'intern'`. If no row — Jenn needs to sign up at `/signup.html` first, then return to this step.

- [ ] **Step 2: Promote Jenn in intern_users**

```sql
update intern_users
set role = 'admin'
where email = 'destinevents.biz@gmail.com';
```

Expected output: `1 row affected.`

- [ ] **Step 3: Update Jenn's auth metadata**

```sql
update auth.users
set raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'::jsonb
where email = 'destinevents.biz@gmail.com';
```

Expected output: `1 row affected.`

- [ ] **Step 4: Verify both tables reflect admin**

```sql
select
  iu.name,
  iu.role                          as db_role,
  au.raw_user_meta_data ->> 'role' as jwt_role
from intern_users iu
join auth.users au on iu.id = au.id
where iu.email = 'destinevents.biz@gmail.com';
```

Expected: `db_role = admin` and `jwt_role = admin`.

- [ ] **Step 5: Have Jenn sign out and sign back in**

Jenn goes to `/intern.html`, signs out, then signs back in. Her new session JWT now carries `role: admin`.

- [ ] **Step 6: Verify Jenn sees the admin UI**

After signing back in, confirm Jenn can see:

- **Approvals** item in the sidebar
- **Interns** item in the sidebar
- **Reports** item in the sidebar
- All interns' timesheets (not just her own) in the Timesheets page
- Approve ✓ and Reject ✕ buttons on pending timesheet entries
