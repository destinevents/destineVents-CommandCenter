# Security Fix + Repo Hygiene — Design Spec

**Date:** 2026-07-02
**Scope:** Phase 1 (privilege escalation fix) and Phase 2 (repo hygiene)
**Goal:** Close a role-spoofing vulnerability and clean up the repository so it's safe and well-maintained

---

## Background

A code review identified a privilege escalation bug and several hygiene gaps. Phase 3 (TS/Vite migration) is deferred — these two phases are scoped and safe to ship independently.

---

## Phase 1 — Security: Role Privilege Escalation Fix

### Problem

`services/authService.ts` resolves a user's role as:

```ts
role: session.user.user_metadata?.role || profile?.role || 'intern'
```

`user_metadata` is the Supabase JWT payload. Users can edit their own JWT metadata by calling `supabase.auth.updateUser({ data: { role: 'admin' } })` from the browser console. Because `user_metadata` is checked first, an intern can set their own role to `admin` and immediately unlock the approvals panel, intern management, and reports — without any server-side check.

The same bug exists in `hq/app.js` line 34:

```js
const role = session.user.user_metadata?.role || 'intern';
```

### Fix

**Rule:** Always trust the database (`intern_users.role`) first. Never use `user_metadata.role` to determine access.

**`services/authService.ts`** — change line 78:
```ts
// BEFORE
role: session.user.user_metadata?.role || profile?.role || 'intern',

// AFTER
role: profile?.role || 'intern',
```

**`hq/app.js`** — line 34 reads role from the JWT. The `getCurrentUser()` call in `hq/app.js` already fetches the session but does not separately fetch the `intern_users` profile. The fix is to call `getProfile(session.user.id)` and use `profile?.role`:
```js
// BEFORE
const role = session.user.user_metadata?.role || 'intern';

// AFTER — fetch profile from DB first
const profile = await getProfile(session.user.id);
const role = profile?.role || 'intern';
```

### Codebase sweep

Before committing, grep the entire codebase for any other location that reads role from `user_metadata`:

```bash
grep -rn "user_metadata.*role\|role.*user_metadata" . \
  --include="*.js" --include="*.ts" \
  | grep -v node_modules | grep -v .git | grep -v ".test."
```

Any match outside of `authService.ts` and `hq/app.js` must be reviewed and fixed to use the database value instead.

### 1b: Same bug in the database RLS policy

`database/schema/intern-schema.sql` line 102–109 — the `admin_write_users` policy also checks `user_metadata`:

```sql
-- CURRENT (vulnerable — OR means either condition grants access)
using (
  (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'supervisor')
  or (select role from intern_users where id = auth.uid()) in ('admin', 'supervisor')
)
```

An intern who sets `user_metadata.role = 'admin'` in the browser passes the first condition and the policy lets them through — bypassing the DB check entirely.

**Fix** — remove the `user_metadata` arm, keep only the DB lookup:

```sql
-- AFTER
drop policy if exists "admin_write_users" on intern_users;
create policy "admin_write_users" on intern_users for all to authenticated
  using (
    (select role from intern_users where id = auth.uid()) in ('admin', 'supervisor')
  )
  with check (
    (select role from intern_users where id = auth.uid()) in ('admin', 'supervisor')
  );
```

Run this in the Supabase SQL editor, then update `database/schema/intern-schema.sql` to match.

### Files changed

| File | Action | Why |
|---|---|---|
| `services/authService.ts` | UPDATE line 78 | Remove user_metadata role trust |
| `hq/app.js` | UPDATE | Remove user_metadata role trust, fetch profile from DB |
| `database/schema/intern-schema.sql` | UPDATE lines 100-109 | Remove user_metadata arm from admin_write_users RLS policy |

---

## Phase 2 — Repo Hygiene

### 2a: .gitignore additions

Current `.gitignore` is missing 5 entries. Add them:

```
coverage/
.env*.local
__MACOSX/
*.tsbuildinfo
.vite/
```

| Entry | Why |
|---|---|
| `coverage/` | Vitest coverage output — currently showing as untracked in `git status` |
| `.env*.local` | Broader pattern; current entry only covers `.env.local`, misses `.env.production.local` etc. |
| `__MACOSX/` | macOS zip artifact that appears when compressing/decompressing on Mac |
| `*.tsbuildinfo` | TypeScript incremental build cache |
| `.vite/` | Vite internal cache directory, created on first `npm run dev` |

### 2b: package.json metadata

Three fields need filling in:

| Field | Current | Change to |
|---|---|---|
| `author` | `""` | `"DestineVents Collective OPC"` |
| `keywords` | `[]` | `["events", "crm", "intern-management", "operations", "supabase"]` |
| `license` | `"ISC"` | `"UNLICENSED"` — ISC is an open-source license; this is a private internal tool |

### Files changed

| File | Action | Why |
|---|---|---|
| `.gitignore` | UPDATE | Add 5 missing entries |
| `package.json` | UPDATE | Fill author, keywords, fix license |

---

## Acceptance criteria

- [ ] An intern cannot gain admin access by running `supabase.auth.updateUser({ data: { role: 'admin' } })` in the browser console — blocked at the JS layer AND the RLS layer
- [ ] `admin_write_users` policy no longer references `auth.jwt() -> 'user_metadata'`
- [ ] Grep sweep confirms zero other locations trust `user_metadata.role` for access control
- [ ] `coverage/` no longer appears in `git status` as untracked
- [ ] `package.json` has non-empty author, keywords, and `UNLICENSED` as license
- [ ] All 129 existing tests still pass after the changes
