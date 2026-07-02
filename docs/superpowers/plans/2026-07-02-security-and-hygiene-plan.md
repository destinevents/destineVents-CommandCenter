# Security Fix + Repo Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close a privilege escalation vulnerability in three places (authService.ts, hq/app.js, Supabase RLS policy) and add five missing .gitignore entries + three missing package.json metadata fields.

**Architecture:** Phase 1 removes all trust of `user_metadata.role` for access control across JS, TS, and SQL layers. Phase 2 is pure config cleanup. Both phases are independent — Phase 2 can be done in any order relative to Phase 1.

**Tech Stack:** TypeScript (Vitest for tests), Vanilla JS, Supabase PostgreSQL (SQL editor for RLS changes)

## Global Constraints

- Do NOT touch any UI logic — only role resolution and config files change
- After fixing `authService.ts`, all existing tests must still pass
- Supabase SQL changes are run in the Supabase dashboard → SQL Editor, then reflected in `database/schema/intern-schema.sql`
- No new npm dependencies

---

### Task 1: Fix `authService.ts` — remove `user_metadata.role` trust

**Files:**
- Modify: `services/authService.ts:78`
- Modify: `services/authService.test.ts` (add one test, update one test)

**Interfaces:**
- Produces: `getCurrentUser()` that resolves role from `profile?.role` only, never from `user_metadata`

- [ ] **Step 1: Write the failing test**

In `services/authService.test.ts`, add this new test case inside the existing `describe('getCurrentUser', ...)` block (after line 120):

```ts
it('uses profile.role from the database, ignoring a higher role set in user_metadata', async () => {
  mockSb.auth.getSession.mockResolvedValue({
    data: {
      session: {
        user: { id: 'u1', user_metadata: { role: 'admin' } }, // attacker-set claim
      },
    },
  });
  const fakeProfile = {
    id: 'u1',
    name: 'Eve',
    email: 'e@e.com',
    role: 'intern', // what the database actually says
    avatar: null,
    school: null,
    program: null,
    created_at: '2025-01-01',
  };
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: fakeProfile, error: null }),
  };
  mockSb.from.mockReturnValue(chain);
  const result = await getCurrentUser();
  expect(result?.role).toBe('intern'); // must NOT be 'admin'
});
```

Also update the existing test `'returns merged user+profile when session exists'` (line 98) — change `user_metadata: { role: 'intern' }` to `user_metadata: {}` so it no longer accidentally relies on the bug:

```ts
// Change line 99 from:
mockSb.auth.getSession.mockResolvedValue({
  data: { session: { user: { id: 'u1', user_metadata: { role: 'intern' } } } },
});
// To:
mockSb.auth.getSession.mockResolvedValue({
  data: { session: { user: { id: 'u1', user_metadata: {} } } },
});
```

- [ ] **Step 2: Run the tests to confirm the new test fails**

```bash
npm test -- services/authService.test.ts
```

Expected: The new test FAILS with something like `expected 'admin' to be 'intern'`. The existing tests pass.

- [ ] **Step 3: Fix `authService.ts` line 78**

In `services/authService.ts`, change line 78 from:

```ts
    role: session.user.user_metadata?.role || profile?.role || 'intern',
```

to:

```ts
    role: profile?.role || 'intern',
```

The full `getCurrentUser` function after the fix:

```ts
export async function getCurrentUser(): Promise<InternUser | null> {
  const session = await getSession();
  if (!session?.user) return null;
  const profile = await getProfile(session.user.id);
  return {
    ...session.user,
    ...(profile || {}),
    id: session.user.id,
    name: profile?.name || session.user.user_metadata?.name || null,
    role: profile?.role || 'intern',
  } as InternUser;
}
```

- [ ] **Step 4: Run tests and confirm all pass**

```bash
npm test -- services/authService.test.ts
```

Expected: All tests pass including the new one.

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: All 129+ tests pass, no regressions.

- [ ] **Step 6: Commit**

```bash
git add services/authService.ts services/authService.test.ts
git commit -m "fix: resolve role from DB profile only, never from user_metadata"
```

---

### Task 2: Fix `hq/app.js` + run grep sweep

**Files:**
- Modify: `hq/app.js:31-44` (the `init()` function)

**Interfaces:**
- Consumes: global `sb` (Supabase client, already in scope — used at line 71 of the same file) and global `getSession()` (already used at line 32)
- Produces: `init()` that queries `intern_users.role` from the database before making the redirect decision

`hq/app.js` is vanilla JS with no test harness. Verification is by grep sweep confirming the pattern is gone.

- [ ] **Step 1: Run the grep sweep to find all occurrences of the bug pattern**

```bash
grep -rn "user_metadata.*role\|role.*user_metadata" . \
  --include="*.js" --include="*.ts" \
  | grep -v node_modules | grep -v .git | grep -v ".test."
```

Expected after Task 1 is complete — exactly one match:
```
hq/app.js:34:    const role = session.user.user_metadata?.role || 'intern';
```

If you see any files other than `hq/app.js`, fix them using the same DB-lookup pattern before committing.

- [ ] **Step 2: Fix `hq/app.js` lines 31–44**

Replace the entire `init()` function:

```js
// BEFORE
async function init() {
  const session = await getSession();
  if (session) {
    const role = session.user.user_metadata?.role || 'intern';
    if (role !== 'admin') {
      window.location.href = 'intern.html';
      return;
    }
    const name = session.user.user_metadata?.full_name || session.user.user_metadata?.name || '';
    enterApp(session.user.email, name);
  } else {
    document.getElementById('login-screen').style.display = 'flex';
  }
}
```

```js
// AFTER
async function init() {
  const session = await getSession();
  if (session) {
    const { data: profile } = await sb.from('intern_users').select('role').eq('id', session.user.id).single();
    const role = profile?.role || 'intern';
    if (role !== 'admin') {
      window.location.href = 'intern.html';
      return;
    }
    const name = session.user.user_metadata?.full_name || session.user.user_metadata?.name || '';
    enterApp(session.user.email, name);
  } else {
    document.getElementById('login-screen').style.display = 'flex';
  }
}
```

- [ ] **Step 3: Re-run the grep sweep to confirm zero remaining occurrences**

```bash
grep -rn "user_metadata.*role\|role.*user_metadata" . \
  --include="*.js" --include="*.ts" \
  | grep -v node_modules | grep -v .git | grep -v ".test."
```

Expected: no output at all.

- [ ] **Step 4: Run the full test suite to confirm no regressions**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add hq/app.js
git commit -m "fix: resolve HQ role from intern_users DB, not user_metadata"
```

---

### Task 3: Fix the `admin_write_users` RLS policy in Supabase

**Files:**
- Modify: `database/schema/intern-schema.sql:100-109`

The actual policy change is applied in the Supabase SQL editor. The local file is updated afterward to stay in sync.

- [ ] **Step 1: Run the policy fix in the Supabase SQL editor**

Go to your Supabase project → SQL Editor and run:

```sql
drop policy if exists "admin_write_users" on intern_users;
create policy "admin_write_users" on intern_users for all to authenticated
  using (
    (select role from intern_users where id = auth.uid()) in ('admin', 'supervisor')
  )
  with check (
    (select role from intern_users where id = auth.uid()) in ('admin', 'supervisor')
  );
```

Expected output: `Success. No rows returned.`

- [ ] **Step 2: Verify the policy was recreated correctly**

```sql
select policyname, cmd, qual
from pg_policies
where tablename = 'intern_users'
order by policyname;
```

Expected: rows for `admin_write_users`, `intern_update_own_profile`, `read_all_users`. The `qual` column for `admin_write_users` must NOT contain the text `user_metadata`.

- [ ] **Step 3: Update `database/schema/intern-schema.sql` lines 100–109**

Replace:

```sql
drop policy if exists "admin_write_users" on intern_users;
create policy "admin_write_users" on intern_users for all to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'supervisor')
    or (select role from intern_users where id = auth.uid()) in ('admin', 'supervisor')
  )
  with check (
    (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'supervisor')
    or (select role from intern_users where id = auth.uid()) in ('admin', 'supervisor')
  );
```

with:

```sql
drop policy if exists "admin_write_users" on intern_users;
create policy "admin_write_users" on intern_users for all to authenticated
  using (
    (select role from intern_users where id = auth.uid()) in ('admin', 'supervisor')
  )
  with check (
    (select role from intern_users where id = auth.uid()) in ('admin', 'supervisor')
  );
```

- [ ] **Step 4: Commit**

```bash
git add database/schema/intern-schema.sql
git commit -m "fix: remove user_metadata trust from admin_write_users RLS policy"
```

---

### Task 4: Repo hygiene — `.gitignore` and `package.json`

**Files:**
- Modify: `.gitignore`
- Modify: `package.json`

No tests needed for config changes.

- [ ] **Step 1: Add 5 entries to `.gitignore`**

Append these lines to `.gitignore` (current file ends at line 6 with `config/config.js`):

```
coverage/
.env*.local
__MACOSX/
*.tsbuildinfo
.vite/
```

Full file after the change:

```
.DS_Store
.vercel
node_modules/
dist/
.env.local
config/config.js
coverage/
.env*.local
__MACOSX/
*.tsbuildinfo
.vite/
```

- [ ] **Step 2: Verify `coverage/` no longer shows as untracked**

```bash
git status
```

Expected: `coverage/` does not appear in the output.

- [ ] **Step 3: Update three fields in `package.json`**

Change:

```json
"keywords": [],
"author": "",
"license": "ISC",
```

to:

```json
"keywords": ["events", "crm", "intern-management", "operations", "supabase"],
"author": "DestineVents Collective OPC",
"license": "UNLICENSED",
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore package.json
git commit -m "chore: add missing .gitignore entries and fill package.json metadata"
```

---

## Acceptance Criteria

- [ ] An intern who runs `supabase.auth.updateUser({ data: { role: 'admin' } })` in the browser console cannot access admin features — blocked at the JS layer (authService.ts + hq/app.js) AND the RLS layer (admin_write_users policy)
- [ ] `admin_write_users` RLS policy `qual` column contains no reference to `user_metadata`
- [ ] Grep sweep `grep -rn "user_metadata.*role\|role.*user_metadata" . --include="*.js" --include="*.ts" | grep -v node_modules | grep -v .git | grep -v ".test."` returns no output
- [ ] All tests pass (run `npm test`)
- [ ] `coverage/` no longer appears in `git status`
- [ ] `package.json` shows `author: "DestineVents Collective OPC"`, non-empty keywords, and `license: "UNLICENSED"`
