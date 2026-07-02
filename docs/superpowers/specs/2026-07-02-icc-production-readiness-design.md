# ICC Production Readiness — Design Spec

**Date:** 2026-07-02
**Scope:** Intern Command Center (ICC) only — HQ is not a priority
**Goal:** Fix two critical bugs and one account setup gap so the real intern team can use the system day-to-day

---

## Context

The ICC is substantially complete: task management, timesheet logging with an 8h/day cap, approve/reject flow with rejection reasons visible to interns, real-time updates via Supabase channels, role-based UI visibility, and audit logging all work. Three issues block production use:

1. Intern names appear as email prefixes in the admin panel (trigger bug)
2. Interns can't save their profile from the Account page (RLS gap)
3. The single admin (Jenn) has no way to get the `admin` role through the normal signup flow

---

## Fix 1 — Trigger name key mismatch

### Problem

The `on_auth_user_created` trigger in `intern-schema.sql` reads `raw_user_meta_data ->> 'full_name'` to populate `intern_users.name`. But `signup.js` sends the key as `name`, not `full_name`. When `full_name` is absent the trigger falls back to `split_part(email, '@', 1)`, so every intern's name in the database is their email prefix (e.g. `john.doe` instead of `John Doe`).

### Fix

**Part A — Patch the trigger function** to check `name` before `full_name`:

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

**Part B — One-time data migration** to fix existing rows whose name was set to the email prefix:

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

### Files changed

| File | Action | Why |
|---|---|---|
| `database/schema/intern-schema.sql` | UPDATE | Replace trigger function with fixed version |

The migration SQL is run once in the Supabase SQL editor and is not stored as a schema file.

---

## Fix 2 — RLS blocks intern profile updates

### Problem

`intern_users` has one write policy (`admin_write_users`) that restricts all INSERT/UPDATE/DELETE to users whose role is `admin` or `supervisor`. When an intern opens the Account page and saves changes to their name, school, or program, Supabase silently rejects the update because no policy permits it.

### Fix

Add a second, additive policy that allows authenticated users to UPDATE their own row. The `with check` clause enforces that `role` cannot be changed — interns cannot promote themselves:

```sql
create policy "intern_update_own_profile" on intern_users
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from intern_users where id = auth.uid())
  );
```

No existing policies are modified. This is a pure addition.

### Files changed

| File | Action | Why |
|---|---|---|
| `database/schema/intern-schema.sql` | UPDATE | Append new RLS policy |

---

## Fix 3 — Set Jenn's account as admin

### Problem

`signup.js` hardcodes `role: 'intern'` in the auth metadata passed to Supabase. All self-registered users get the `intern` role. There is no UI path to assign `admin`. The single admin (Jenn, `destinevents.biz@gmail.com`) needs to be able to approve timesheets, manage tasks, view the Interns panel, and access Reports.

### Fix

A one-time SQL command run in the Supabase SQL editor after Jenn signs up:

```sql
-- Step 1: update intern_users row
update intern_users
set role = 'admin'
where email = 'destinevents.biz@gmail.com';

-- Step 2: update auth metadata so the JWT role claim is correct
update auth.users
set raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'::jsonb
where email = 'destinevents.biz@gmail.com';
```

Jenn must sign out and sign back in after this runs so her session JWT picks up the new role claim.

### Files changed

None — this is a one-time manual SQL operation, not a code change.

---

## Implementation order

1. Run Fix 1 Part A (trigger patch) in Supabase SQL editor
2. Run Fix 1 Part B (data migration) in Supabase SQL editor
3. Run Fix 2 (RLS policy) in Supabase SQL editor
4. Update `database/schema/intern-schema.sql` to reflect both SQL changes
5. Run Fix 3 (Jenn's role) in Supabase SQL editor after she signs up

Fixes 1–3 are all SQL-only. The only code file that changes is `intern-schema.sql` (updated to match what's actually deployed).

---

## Acceptance criteria

- [ ] A new intern who signs up sees their real name in the admin Interns panel
- [ ] Existing interns with email-prefix names are corrected by the migration
- [ ] An intern can update name, school, and program from the Account page and the changes persist after reload
- [ ] An intern cannot change their own role via any UI path
- [ ] Jenn can log in, see the Approvals panel, and approve/reject timesheets
- [ ] Jenn can see all interns in the Interns panel and all timesheets in the Reports page
