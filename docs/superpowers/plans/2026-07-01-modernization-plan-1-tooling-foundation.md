# Modernization Plan 1 of 2: Tooling + Foundation Layers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Vite dev server, TypeScript, and Vitest to the project, then convert all `services/`, `utils/`, and `config/` files to typed TypeScript modules with unit tests — leaving HTML and page modules (`js/intern/`, `js/hq/`) untouched.

**Architecture:** Vite serves existing HTML in dev mode without changing any script tags. Services are converted to proper ES modules (export/import) one at a time. A shared `types.ts` file defines all domain interfaces. Vitest mocks the Supabase client to test service logic in isolation. The app continues to work in the browser throughout.

**Tech Stack:** Vite 5, TypeScript 5, Vitest 2, @vitest/coverage-v8, ESLint 9 (flat config), Prettier 3, @supabase/supabase-js 2

## Global Constraints

- Node.js ≥ 18 required
- All new files use `.ts` extension
- Services export named functions (no default exports)
- `strict: false` in tsconfig — each migrated file must be written strict-compatible
- No changes to `index.html`, `intern.html`, `login.html`, `signup.html`, or any `js/intern/`, `js/hq/` files in this plan
- Tests use Vitest globals (`describe`, `it`, `expect`, `vi`) — no imports needed
- Supabase client is mocked in all tests — no real network calls
- Commit after every task

---

## File Map

```
Created:
  package.json                          ← npm scripts + dependency list
  vite.config.ts                        ← Vite dev server + Vitest config
  tsconfig.json                         ← TypeScript config (allowJs, strict: false)
  eslint.config.js                      ← ESLint flat config (JS + TS)
  .prettierrc                           ← Prettier config
  .env.local                            ← Supabase credentials (gitignored)
  js/shared/types.ts                    ← All domain interfaces
  services/supabase.ts                  ← Typed Supabase client (replaces supabase.js)
  services/authService.ts               ← Typed auth functions
  services/authService.test.ts          ← Auth unit tests
  services/taskService.ts               ← Typed task functions
  services/taskService.test.ts          ← Task unit tests
  services/timesheetService.ts          ← Typed timesheet functions
  services/timesheetService.test.ts     ← Timesheet unit tests
  utils/validators.ts                   ← Typed validators
  utils/validators.test.ts              ← Validator unit tests
  config/roles.ts                       ← Typed roles + permissions

Deleted:
  services/supabase.js                  ← Replaced by supabase.ts
  config/config.js                      ← Replaced by .env.local + supabase.ts
```

---

### Task 1: Bootstrap dev tooling

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `eslint.config.js`
- Create: `.prettierrc`
- Create: `.env.local`

**Interfaces:**
- Produces: `npm run dev`, `npm run test`, `npm run lint`, `npm run build`

- [ ] **Step 1: Initialise npm and install dependencies**

```bash
npm init -y
npm install -D vite typescript vitest @vitest/coverage-v8 eslint @eslint/js @typescript-eslint/eslint-plugin @typescript-eslint/parser prettier
npm install @supabase/supabase-js
```

Expected: `node_modules/` created, `package.json` updated with devDependencies.

- [ ] **Step 2: Write `package.json` scripts**

Replace the `"scripts"` block in `package.json` with:

```json
{
  "name": "destinevents-command-center",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint .",
    "format": "prettier --write ."
  }
}
```

- [ ] **Step 3: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['services/**/*.ts', 'utils/**/*.ts', 'config/**/*.ts'],
      exclude: ['**/*.test.ts'],
    },
  },
});
```

- [ ] **Step 4: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowJs": true,
    "checkJs": false,
    "strict": false,
    "noEmit": true,
    "skipLibCheck": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"]
  },
  "include": [
    "js/**/*",
    "services/**/*",
    "utils/**/*",
    "config/**/*",
    "lib/**/*",
    "vite.config.ts"
  ],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 5: Create `eslint.config.js`**

```js
import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tsParser },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    ignores: ['node_modules/**', 'dist/**'],
  },
];
```

- [ ] **Step 6: Create `.prettierrc`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 7: Create `.env.local` with Supabase credentials**

Copy the values from `config/config.js`:

```
VITE_SUPABASE_URL=<paste your value from config/config.js>
VITE_SUPABASE_ANON_KEY=<paste your value from config/config.js>
```

Confirm `.gitignore` already ignores `.env.local` (if not, add it).

- [ ] **Step 8: Verify dev server starts**

```bash
npm run dev
```

Expected: Vite dev server starts on `http://localhost:5173`. Open each page in browser and confirm they load with no console errors.

- [ ] **Step 9: Verify test runner works**

```bash
npm run test
```

Expected: `No test files found` (no tests yet — that is correct at this point).

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json vite.config.ts tsconfig.json eslint.config.js .prettierrc
git commit -m "feat: add Vite, TypeScript, Vitest, ESLint, Prettier"
```

---

### Task 2: Define shared TypeScript types

**Files:**
- Create: `js/shared/types.ts`

**Interfaces:**
- Produces: `InternUser`, `Task`, `Timesheet`, `TaskStatus`, `TimesheetStatus`, `UserRole` — imported by all later tasks

- [ ] **Step 1: Create `js/shared/types.ts`**

```ts
export type UserRole = 'admin' | 'supervisor' | 'intern';

export type TaskStatus =
  | 'assigned'
  | 'acknowledged'
  | 'in_progress'
  | 'completed'
  | 'reviewed';

export type TimesheetStatus = 'pending' | 'approved' | 'rejected';

export interface InternUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar: string;
  school: string | null;
  program: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  assigned_to: string | null;
  created_by: string;
  output_type: string | null;
  output_link: string | null;
  created_at: string;
}

export interface Timesheet {
  id: string;
  intern_id: string;
  date: string;
  hours: number;
  description: string;
  skills: string[];
  status: TimesheetStatus;
  created_at: string;
}

export interface ServiceResult<T> {
  data: T | null;
  error: { message: string } | null;
}

export interface TaskStats {
  total: number;
  active: number;
  completed: number;
  byStatus: Record<TaskStatus, number>;
}

export interface TimesheetStats {
  total: number;
  approvedHours: number;
  pendingHours: number;
  totalHours: number;
  approvedCount: number;
  pendingCount: number;
}

export interface SkillFrequency {
  skill: string;
  count: number;
}

export interface TaskAction {
  action: string;
  label: string;
  style: string;
}
```

- [ ] **Step 2: Verify TypeScript accepts the file**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add js/shared/types.ts
git commit -m "feat: add shared TypeScript domain types"
```

---

### Task 3: Export logger from utils/logger.js

**Files:**
- Modify: `utils/logger.js` — add `export` so the vi.mock in authService.test.ts resolves it

**Interfaces:**
- Produces: named `logger` export consumed by `authService.ts`

- [ ] **Step 1: Add export to `utils/logger.js`**

Open `utils/logger.js` and ensure the logger object is exported. Add this line at the end if it isn't there:

```js
// ESM export so TypeScript services can import it
export { logger };
```

If the file already uses `const logger = ...`, just append the export line. Do not restructure the file.

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add utils/logger.js
git commit -m "feat: export logger from utils/logger.js for ESM consumers"
```

---

### Task 4: Convert supabase.js → supabase.ts

**Files:**
- Create: `services/supabase.ts`
- Delete: `services/supabase.js`

**Interfaces:**
- Produces: `export const sb: SupabaseClient` — imported by all service files

- [ ] **Step 1: Create `services/supabase.ts`**

```ts
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local');
}

export const sb = createClient(url, key);
```

- [ ] **Step 2: Delete the old file**

```bash
git rm services/supabase.js
```

- [ ] **Step 3: Remove the Supabase CDN script tag from all 4 HTML files**

In each of `index.html`, `intern.html`, `login.html`, `signup.html`, remove the line:
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

Also remove the `config/config.js` script tag from each HTML file:
```html
<script src="config/config.js"></script>
```

Note: The `sb` global used by old `.js` page modules will be wired up in Plan 2 when those files are converted. For now, ensure `npm run dev` still loads the pages (the old page modules reference the global `sb` — this is acceptable during the transition period as those files are not yet converted).

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: No errors from `services/supabase.ts`.

- [ ] **Step 5: Commit**

```bash
git add services/supabase.ts index.html intern.html login.html signup.html
git commit -m "feat: replace Supabase CDN script with npm package and env vars"
```

---

### Task 5: Convert + test authService

**Files:**
- Create: `services/authService.ts`
- Create: `services/authService.test.ts`
- Delete: `services/authService.js`

**Interfaces:**
- Consumes: `sb` from `./supabase`, `InternUser`, `ServiceResult`, `UserRole` from `../js/shared/types`
- Produces:
  - `signUp(email, password, meta): Promise<ServiceResult<unknown>>`
  - `signIn(email, password): Promise<ServiceResult<unknown>>`
  - `signOut(): Promise<void>`
  - `getSession(): Promise<unknown>`
  - `getProfile(userId): Promise<InternUser | null>`
  - `getCurrentUser(): Promise<InternUser | null>`
  - `updateProfile(userId, updates): Promise<{ error: { message: string } | null }>`
  - `updatePassword(email, currentPassword, newPassword): Promise<{ error: { message: string } | null }>`

- [ ] **Step 1: Write the failing tests**

Create `services/authService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./supabase', () => ({
  sb: {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
      refreshSession: vi.fn(),
      getUser: vi.fn(),
      updateUser: vi.fn(),
    },
    from: vi.fn(),
  },
}));

vi.mock('../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

import { sb } from './supabase';
import {
  signIn,
  signOut,
  getProfile,
  getCurrentUser,
  updateProfile,
  updatePassword,
} from './authService';

const mockSb = sb as unknown as {
  auth: Record<string, ReturnType<typeof vi.fn>>;
  from: ReturnType<typeof vi.fn>;
};

beforeEach(() => vi.clearAllMocks());

describe('signIn', () => {
  it('returns data on success', async () => {
    const fakeSession = { user: { id: 'u1' } };
    mockSb.auth.signInWithPassword.mockResolvedValue({ data: fakeSession, error: null });
    const result = await signIn('test@example.com', 'password123');
    expect(result.data).toEqual(fakeSession);
    expect(result.error).toBeNull();
  });

  it('returns error on failure', async () => {
    const fakeError = { message: 'Invalid credentials' };
    mockSb.auth.signInWithPassword.mockResolvedValue({ data: null, error: fakeError });
    const result = await signIn('test@example.com', 'wrong');
    expect(result.data).toBeNull();
    expect(result.error).toEqual(fakeError);
  });
});

describe('signOut', () => {
  it('calls sb.auth.signOut', async () => {
    mockSb.auth.signOut.mockResolvedValue({ error: null });
    await signOut();
    expect(mockSb.auth.signOut).toHaveBeenCalledOnce();
  });
});

describe('getProfile', () => {
  it('returns profile on success', async () => {
    const fakeProfile = { id: 'u1', name: 'Alice', email: 'a@b.com', role: 'intern' };
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: fakeProfile, error: null }),
    };
    mockSb.from.mockReturnValue(chain);
    const result = await getProfile('u1');
    expect(result).toEqual(fakeProfile);
  });

  it('returns null on error', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
    };
    mockSb.from.mockReturnValue(chain);
    const result = await getProfile('u1');
    expect(result).toBeNull();
  });
});

describe('getCurrentUser', () => {
  it('returns null when no session', async () => {
    mockSb.auth.getSession.mockResolvedValue({ data: { session: null } });
    const result = await getCurrentUser();
    expect(result).toBeNull();
  });

  it('returns merged user+profile when session exists', async () => {
    mockSb.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'u1', user_metadata: { role: 'intern' } } } },
    });
    const fakeProfile = {
      id: 'u1', name: 'Bob', email: 'b@b.com', role: 'intern',
      avatar: 'BO', school: null, program: null, created_at: '2025-01-01',
    };
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: fakeProfile, error: null }),
    };
    mockSb.from.mockReturnValue(chain);
    const result = await getCurrentUser();
    expect(result?.name).toBe('Bob');
    expect(result?.role).toBe('intern');
  });
});

describe('updateProfile', () => {
  it('returns null error on full success', async () => {
    const chain = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
    mockSb.from.mockReturnValue(chain);
    mockSb.auth.updateUser.mockResolvedValue({ error: null });
    const result = await updateProfile('u1', { name: 'New Name', school: 'BSU', program: 'IT' });
    expect(result.error).toBeNull();
  });

  it('returns error when DB update fails', async () => {
    const dbError = { message: 'DB error' };
    const chain = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: dbError }) };
    mockSb.from.mockReturnValue(chain);
    const result = await updateProfile('u1', { name: 'x', school: null, program: null });
    expect(result.error).toEqual(dbError);
  });

  it('returns error when auth metadata update fails but DB succeeded', async () => {
    const metaError = { message: 'Meta error' };
    const chain = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
    mockSb.from.mockReturnValue(chain);
    mockSb.auth.updateUser.mockResolvedValue({ error: metaError });
    const result = await updateProfile('u1', { name: 'x', school: null, program: null });
    expect(result.error).toEqual(metaError);
  });
});

describe('updatePassword', () => {
  it('returns session-expired error when email is empty', async () => {
    const result = await updatePassword('', 'old', 'new');
    expect(result.error?.message).toContain('Session expired');
  });

  it('returns incorrect-password error when re-auth fails', async () => {
    mockSb.auth.signInWithPassword.mockResolvedValue({ error: { message: 'wrong' } });
    const result = await updatePassword('a@b.com', 'wrong', 'new');
    expect(result.error?.message).toContain('incorrect');
  });

  it('returns null error on full success', async () => {
    mockSb.auth.signInWithPassword.mockResolvedValue({ error: null });
    mockSb.auth.updateUser.mockResolvedValue({ error: null });
    const result = await updatePassword('a@b.com', 'old', 'NewPass1!');
    expect(result.error).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm run test
```

Expected: Multiple errors — `authService` module not found.

- [ ] **Step 3: Create `services/authService.ts`**

```ts
import { sb } from './supabase';
import type { InternUser } from '../js/shared/types';

interface AuthMeta {
  name?: string;
  school?: string | null;
  program?: string | null;
  role?: string;
  [key: string]: unknown;
}

interface ProfileUpdates {
  name: string;
  school: string | null;
  program: string | null;
}

interface AuthResult {
  error: { message: string } | null;
}

const logger = {
  error: (ctx: string, msg: string, err?: unknown) => console.error(`[${ctx}]`, msg, err),
  warn:  (ctx: string, msg: string) => console.warn(`[${ctx}]`, msg),
};

export async function signUp(email: string, password: string, meta: AuthMeta = {}) {
  try {
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: meta } });
    if (error) return { data: null, error };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function signIn(email: string, password: string) {
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { data: null, error };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function signOut(): Promise<void> {
  const { error } = await sb.auth.signOut();
  if (error) logger.error('authService.signOut', error.message, error);
}

export async function getSession() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    return session;
  } catch (err) {
    logger.error('authService.getSession', (err as Error).message, err);
    return null;
  }
}

export async function getProfile(userId: string): Promise<InternUser | null> {
  const { data, error } = await sb.from('intern_users').select('*').eq('id', userId).single();
  if (error) { logger.warn('authService.getProfile', error.message); return null; }
  return data as InternUser;
}

export async function getCurrentUser(): Promise<InternUser | null> {
  const session = await getSession();
  if (!session?.user) return null;
  const profile = await getProfile(session.user.id);
  return {
    ...session.user,
    ...(profile || {}),
    id: session.user.id,
    name: profile?.name || session.user.user_metadata?.name || null,
    role: session.user.user_metadata?.role || profile?.role || 'intern',
  } as InternUser;
}

export async function getAuthUser() {
  try {
    const { data: { user } } = await sb.auth.getUser();
    return user;
  } catch (err) {
    logger.error('authService.getAuthUser', (err as Error).message, err);
    return null;
  }
}

export async function updateProfile(userId: string, updates: ProfileUpdates): Promise<AuthResult> {
  try {
    const { error: dbErr } = await sb.from('intern_users').update(updates).eq('id', userId);
    if (dbErr) return { error: dbErr };
    const { error: metaErr } = await sb.auth.updateUser({ data: updates });
    if (metaErr) return { error: metaErr };
    return { error: null };
  } catch (err) {
    return { error: err as { message: string } };
  }
}

export async function updatePassword(
  email: string,
  currentPassword: string,
  newPassword: string
): Promise<AuthResult> {
  if (!email) return { error: { message: 'Session expired. Please sign in again.' } };
  try {
    const { error: authErr } = await sb.auth.signInWithPassword({ email, password: currentPassword });
    if (authErr) return { error: { message: 'Current password is incorrect.' } };
    const { error: updateErr } = await sb.auth.updateUser({ password: newPassword });
    if (updateErr) return { error: updateErr };
    return { error: null };
  } catch (err) {
    logger.error('authService.updatePassword', (err as Error).message, err);
    return { error: err as { message: string } };
  }
}
```

- [ ] **Step 4: Delete old file**

```bash
git rm services/authService.js
```

- [ ] **Step 5: Run tests — confirm they pass**

```bash
npm run test
```

Expected: All `authService` tests pass. Output ends with `✓ services/authService.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add services/authService.ts services/authService.test.ts
git commit -m "feat: convert authService to TypeScript with unit tests"
```

---

### Task 6: Convert + test taskService

**Files:**
- Create: `services/taskService.ts`
- Create: `services/taskService.test.ts`
- Delete: `services/taskService.js`

**Interfaces:**
- Consumes: `sb` from `./supabase`, `Task`, `TaskStatus`, `TaskStats`, `TaskAction`, `UserRole` from `../js/shared/types`
- Produces:
  - `fetchTasks(role: UserRole, userId: string): Promise<Task[]>`
  - `createTask(data: Partial<Task>): Promise<Task | null>`
  - `updateTask(id: string, data: Partial<Task>): Promise<Task | null>`
  - `getNextTaskAction(task: Task | null, role: UserRole): TaskAction | null`
  - `requiresOutputLink(outputType: string | null): boolean`
  - `calcTaskStats(tasks: Task[]): TaskStats`

- [ ] **Step 1: Write the failing tests**

Create `services/taskService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./supabase', () => ({
  sb: { from: vi.fn() },
}));

import { sb } from './supabase';
import {
  fetchTasks,
  createTask,
  updateTask,
  getNextTaskAction,
  requiresOutputLink,
  calcTaskStats,
} from './taskService';
import type { Task } from '../js/shared/types';

const mockFrom = sb.from as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 't1', title: 'Test task', description: null, status: 'assigned',
  assigned_to: 'u1', created_by: 'admin1', output_type: null,
  output_link: null, created_at: '2025-01-01', ...overrides,
});

describe('fetchTasks', () => {
  it('returns tasks for admin (no filter)', async () => {
    const tasks = [makeTask()];
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: tasks, error: null }),
    };
    mockFrom.mockReturnValue(chain);
    const result = await fetchTasks('admin', 'u1');
    expect(result).toEqual(tasks);
  });

  it('returns empty array on error', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
    };
    mockFrom.mockReturnValue(chain);
    const result = await fetchTasks('admin', 'u1');
    expect(result).toEqual([]);
  });
});

describe('createTask', () => {
  it('returns created task on success', async () => {
    const task = makeTask({ title: 'New task' });
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [task], error: null }),
    };
    mockFrom.mockReturnValue(chain);
    const result = await createTask({ title: 'New task', created_by: 'admin1' });
    expect(result).toEqual(task);
  });

  it('returns null on error', async () => {
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
    };
    mockFrom.mockReturnValue(chain);
    const result = await createTask({ title: 'x' });
    expect(result).toBeNull();
  });
});

describe('updateTask', () => {
  it('returns updated task on success', async () => {
    const task = makeTask({ status: 'acknowledged' });
    const chain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [task], error: null }),
    };
    mockFrom.mockReturnValue(chain);
    const result = await updateTask('t1', { status: 'acknowledged' });
    expect(result?.status).toBe('acknowledged');
  });
});

describe('getNextTaskAction', () => {
  it('returns null when task is null', () =>
    expect(getNextTaskAction(null, 'intern')).toBeNull());
  it('returns null for reviewed tasks', () =>
    expect(getNextTaskAction(makeTask({ status: 'reviewed' }), 'admin')).toBeNull());
  it('returns acknowledge action for assigned intern', () => {
    const action = getNextTaskAction(makeTask({ status: 'assigned' }), 'intern');
    expect(action?.action).toBe('acknowledge');
  });
  it('returns null for completed task when role is intern', () =>
    expect(getNextTaskAction(makeTask({ status: 'completed' }), 'intern')).toBeNull());
  it('returns review action for completed task when role is admin', () => {
    const action = getNextTaskAction(makeTask({ status: 'completed' }), 'admin');
    expect(action?.action).toBe('review');
  });
});

describe('requiresOutputLink', () => {
  it('returns true for code', () => expect(requiresOutputLink('code')).toBe(true));
  it('returns true for design', () => expect(requiresOutputLink('design')).toBe(true));
  it('returns false for unknown type', () => expect(requiresOutputLink('other')).toBe(false));
  it('returns false for null', () => expect(requiresOutputLink(null)).toBe(false));
});

describe('calcTaskStats', () => {
  it('calculates correct totals', () => {
    const tasks = [
      makeTask({ status: 'assigned' }),
      makeTask({ status: 'completed' }),
      makeTask({ status: 'reviewed' }),
    ];
    const stats = calcTaskStats(tasks);
    expect(stats.total).toBe(3);
    expect(stats.active).toBe(1);
    expect(stats.completed).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm run test
```

Expected: Errors — `taskService` module not found.

- [ ] **Step 3: Create `services/taskService.ts`**

```ts
import { sb } from './supabase';
import type { Task, TaskStatus, TaskStats, TaskAction, UserRole } from '../js/shared/types';

const logger = {
  error: (ctx: string, msg: string, err?: unknown) => console.error(`[${ctx}]`, msg, err),
};

export async function fetchTasks(role: UserRole, userId: string): Promise<Task[]> {
  let query = sb.from('intern_tasks').select('*').order('created_at', { ascending: false });
  if (role === 'intern') query = (query as any).eq('assigned_to', userId);
  const { data, error } = await query;
  if (error) { logger.error('fetchTasks', error.message, error); return []; }
  return (data ?? []) as Task[];
}

export async function createTask(data: Partial<Task>): Promise<Task | null> {
  const { data: result, error } = await sb.from('intern_tasks').insert(data).select();
  if (error) { logger.error('createTask', error.message, error); return null; }
  return ((result as Task[] | null)?.[0]) ?? null;
}

export async function updateTask(id: string, data: Partial<Task>): Promise<Task | null> {
  const { data: result, error } = await sb.from('intern_tasks').update(data).eq('id', id).select();
  if (error) { logger.error('updateTask', error.message, error); return null; }
  return ((result as Task[] | null)?.[0]) ?? null;
}

const TASK_STATUS_TRANSITIONS: Record<TaskStatus, { next: TaskStatus | null; actionLabel: string | null }> = {
  assigned:     { next: 'acknowledged', actionLabel: 'Acknowledge' },
  acknowledged: { next: 'in_progress',  actionLabel: 'Start' },
  in_progress:  { next: 'completed',    actionLabel: 'Mark Complete' },
  completed:    { next: 'reviewed',     actionLabel: 'Mark Reviewed' },
  reviewed:     { next: null,           actionLabel: null },
};

export function getNextTaskAction(task: Task | null, role: UserRole): TaskAction | null {
  if (!task) return null;
  const transition = TASK_STATUS_TRANSITIONS[task.status];
  if (!transition?.next) return null;
  if (task.status === 'completed' && role === 'intern') return null;
  if (task.status === 'completed') return { action: 'review', label: transition.actionLabel!, style: '#f5f3ff;color:#8b5cf6' };
  if (transition.next === 'acknowledged' && role === 'intern') return { action: 'acknowledge', label: transition.actionLabel!, style: '#fffbeb;color:#f59e0b' };
  if (transition.next === 'in_progress'  && role === 'intern') return { action: 'start',       label: transition.actionLabel!, style: '#eff6ff;color:#3b82f6' };
  if (transition.next === 'completed'    && role === 'intern') return { action: 'complete',     label: transition.actionLabel!, style: '#ecfdf5;color:#10b981' };
  return null;
}

export function requiresOutputLink(outputType: string | null): boolean {
  return ['code', 'design', 'video', 'landing_page'].includes(outputType ?? '');
}

export function calcTaskStats(tasks: Task[]): TaskStats {
  return {
    total:     tasks.length,
    active:    tasks.filter(t => !['completed', 'reviewed'].includes(t.status)).length,
    completed: tasks.filter(t =>  ['completed', 'reviewed'].includes(t.status)).length,
    byStatus:  Object.fromEntries(
      (['assigned', 'acknowledged', 'in_progress', 'completed', 'reviewed'] as TaskStatus[]).map(s => [
        s, tasks.filter(t => t.status === s).length,
      ])
    ) as Record<TaskStatus, number>,
  };
}
```

- [ ] **Step 4: Delete old file**

```bash
git rm services/taskService.js
```

- [ ] **Step 5: Run tests — confirm they pass**

```bash
npm run test
```

Expected: All `taskService` tests pass.

- [ ] **Step 6: Commit**

```bash
git add services/taskService.ts services/taskService.test.ts
git commit -m "feat: convert taskService to TypeScript with unit tests"
```

---

### Task 7: Convert + test timesheetService

**Files:**
- Create: `services/timesheetService.ts`
- Create: `services/timesheetService.test.ts`
- Delete: `services/timesheetService.js`

**Interfaces:**
- Consumes: `sb` from `./supabase`, `Timesheet`, `TimesheetStats`, `SkillFrequency`, `UserRole` from `../js/shared/types`
- Produces:
  - `fetchTimesheets(role: UserRole, userId: string): Promise<Timesheet[]>`
  - `createTimesheet(data: Partial<Timesheet>): Promise<Timesheet | null>`
  - `updateTimesheet(id: string, data: Partial<Timesheet>): Promise<Timesheet | null>`
  - `calcTimesheetStats(sheets: Timesheet[]): TimesheetStats`
  - `getExistingHoursForDate(sheets: Timesheet[], date: string, userId: string): number`
  - `buildSkillFrequency(sheets: Timesheet[]): SkillFrequency[]`

- [ ] **Step 1: Write the failing tests**

Create `services/timesheetService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./supabase', () => ({
  sb: { from: vi.fn() },
}));

import { sb } from './supabase';
import {
  fetchTimesheets,
  createTimesheet,
  calcTimesheetStats,
  getExistingHoursForDate,
  buildSkillFrequency,
} from './timesheetService';
import type { Timesheet } from '../js/shared/types';

const mockFrom = sb.from as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

const makeSheet = (overrides: Partial<Timesheet> = {}): Timesheet => ({
  id: 's1', intern_id: 'u1', date: '2025-06-01', hours: 4,
  description: 'Worked on feature', skills: ['TypeScript'],
  status: 'pending', created_at: '2025-06-01', ...overrides,
});

describe('fetchTimesheets', () => {
  it('returns timesheets on success', async () => {
    const sheets = [makeSheet()];
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: sheets, error: null }),
    };
    mockFrom.mockReturnValue(chain);
    const result = await fetchTimesheets('admin', 'u1');
    expect(result).toEqual(sheets);
  });

  it('returns empty array on error', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
    };
    mockFrom.mockReturnValue(chain);
    const result = await fetchTimesheets('intern', 'u1');
    expect(result).toEqual([]);
  });
});

describe('createTimesheet', () => {
  it('returns created sheet on success', async () => {
    const sheet = makeSheet();
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [sheet], error: null }),
    };
    mockFrom.mockReturnValue(chain);
    const result = await createTimesheet({ intern_id: 'u1', date: '2025-06-01', hours: 4, description: 'x', skills: [] });
    expect(result).toEqual(sheet);
  });
});

describe('calcTimesheetStats', () => {
  it('sums approved and pending hours correctly', () => {
    const sheets = [
      makeSheet({ hours: 4, status: 'approved' }),
      makeSheet({ hours: 3, status: 'approved' }),
      makeSheet({ hours: 2, status: 'pending' }),
    ];
    const stats = calcTimesheetStats(sheets);
    expect(stats.approvedHours).toBe(7);
    expect(stats.pendingHours).toBe(2);
    expect(stats.totalHours).toBe(9);
    expect(stats.approvedCount).toBe(2);
    expect(stats.pendingCount).toBe(1);
  });
});

describe('getExistingHoursForDate', () => {
  it('sums hours for a specific date and user only', () => {
    const sheets = [
      makeSheet({ date: '2025-06-01', hours: 3, intern_id: 'u1' }),
      makeSheet({ date: '2025-06-01', hours: 2, intern_id: 'u1' }),
      makeSheet({ date: '2025-06-02', hours: 5, intern_id: 'u1' }),
      makeSheet({ date: '2025-06-01', hours: 8, intern_id: 'u2' }),
    ];
    expect(getExistingHoursForDate(sheets, '2025-06-01', 'u1')).toBe(5);
  });
});

describe('buildSkillFrequency', () => {
  it('counts skills from approved sheets only, sorted descending', () => {
    const sheets = [
      makeSheet({ status: 'approved', skills: ['TypeScript', 'React'] }),
      makeSheet({ status: 'approved', skills: ['TypeScript'] }),
      makeSheet({ status: 'pending',  skills: ['Python'] }),
    ];
    const freq = buildSkillFrequency(sheets);
    expect(freq[0]).toEqual({ skill: 'TypeScript', count: 2 });
    expect(freq.find(f => f.skill === 'Python')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm run test
```

Expected: Errors — `timesheetService` module not found.

- [ ] **Step 3: Create `services/timesheetService.ts`**

```ts
import { sb } from './supabase';
import type { Timesheet, TimesheetStats, SkillFrequency, UserRole } from '../js/shared/types';

const logger = {
  error: (ctx: string, msg: string, err?: unknown) => console.error(`[${ctx}]`, msg, err),
};

export async function fetchTimesheets(role: UserRole, userId: string): Promise<Timesheet[]> {
  let query = sb.from('intern_timesheets').select('*').order('date', { ascending: false });
  if (role === 'intern') query = (query as any).eq('intern_id', userId);
  const { data, error } = await query;
  if (error) { logger.error('fetchTimesheets', error.message, error); return []; }
  return (data ?? []) as Timesheet[];
}

export async function createTimesheet(data: Partial<Timesheet>): Promise<Timesheet | null> {
  const { data: result, error } = await sb.from('intern_timesheets').insert(data).select();
  if (error) { logger.error('createTimesheet', error.message, error); return null; }
  return ((result as Timesheet[] | null)?.[0]) ?? null;
}

export async function updateTimesheet(id: string, data: Partial<Timesheet>): Promise<Timesheet | null> {
  const { data: result, error } = await sb.from('intern_timesheets').update(data).eq('id', id).select();
  if (error) { logger.error('updateTimesheet', error.message, error); return null; }
  return ((result as Timesheet[] | null)?.[0]) ?? null;
}

export function calcTimesheetStats(sheets: Timesheet[]): TimesheetStats {
  const approved = sheets.filter(t => t.status === 'approved');
  const pending  = sheets.filter(t => t.status === 'pending');
  return {
    total:         sheets.length,
    approvedHours: approved.reduce((s, t) => s + t.hours, 0),
    pendingHours:  pending.reduce((s, t) => s + t.hours, 0),
    totalHours:    sheets.reduce((s, t) => s + t.hours, 0),
    approvedCount: approved.length,
    pendingCount:  pending.length,
  };
}

export function getExistingHoursForDate(sheets: Timesheet[], date: string, userId: string): number {
  return sheets
    .filter(ts => ts.date === date && ts.intern_id === userId)
    .reduce((s, t) => s + t.hours, 0);
}

export function buildSkillFrequency(sheets: Timesheet[]): SkillFrequency[] {
  const skillMap: Record<string, number> = {};
  sheets
    .filter(t => t.status === 'approved')
    .forEach(ts => (ts.skills || []).forEach(s => { skillMap[s] = (skillMap[s] || 0) + 1; }));
  return Object.entries(skillMap)
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count);
}
```

- [ ] **Step 4: Delete old file**

```bash
git rm services/timesheetService.js
```

- [ ] **Step 5: Run tests — confirm they pass**

```bash
npm run test
```

Expected: All `timesheetService` tests pass.

- [ ] **Step 6: Commit**

```bash
git add services/timesheetService.ts services/timesheetService.test.ts
git commit -m "feat: convert timesheetService to TypeScript with unit tests"
```

---

### Task 8: Convert + test validators

**Files:**
- Create: `utils/validators.ts`
- Create: `utils/validators.test.ts`
- Delete: `utils/validators.js`

**Interfaces:**
- Produces:
  - `validateRequired(value: unknown, fieldName: string): string | null`
  - `validateEmail(value: string): string | null`
  - `validatePassword(value: string): string | null`
  - `validateNumber(value: string, fieldName: string, min?: number, max?: number): string | null`
  - `validateDate(value: string, fieldName: string): string | null`
  - `validateForm(fields: [unknown, string, ...ValidatorFn[]][]): string | null`
  - `validateTaskStatusTransition(current: TaskStatus, next: TaskStatus): boolean`
  - `validateDailyHours(existing: number, newHours: number, max?: number): string | null`

- [ ] **Step 1: Write the failing tests**

Create `utils/validators.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  validateRequired,
  validateEmail,
  validateNumber,
  validateDate,
  validateForm,
  validateTaskStatusTransition,
  validateDailyHours,
} from './validators';

describe('validateRequired', () => {
  it('returns null for a valid string', () => expect(validateRequired('hello', 'Field')).toBeNull());
  it('returns error for empty string', () => expect(validateRequired('', 'Name')).toBe('Name is required.'));
  it('returns error for null', () => expect(validateRequired(null, 'Name')).toBe('Name is required.'));
  it('returns error for whitespace only', () => expect(validateRequired('   ', 'Name')).toBe('Name is required.'));
});

describe('validateEmail', () => {
  it('returns null for valid email', () => expect(validateEmail('a@b.com')).toBeNull());
  it('returns error for missing @', () => expect(validateEmail('notanemail')).toBeTruthy());
  it('returns error for empty string', () => expect(validateEmail('')).toBeTruthy());
});

describe('validateNumber', () => {
  it('returns null for valid number in range', () => expect(validateNumber('5', 'Hours', 0, 8)).toBeNull());
  it('returns error when below min', () => expect(validateNumber('-1', 'Hours', 0, 8)).toBeTruthy());
  it('returns error when above max', () => expect(validateNumber('10', 'Hours', 0, 8)).toBeTruthy());
  it('returns error for non-number', () => expect(validateNumber('abc', 'Hours')).toBeTruthy());
});

describe('validateDate', () => {
  it('returns null for valid date', () => expect(validateDate('2025-06-01', 'Date')).toBeNull());
  it('returns error for invalid date string', () => expect(validateDate('not-a-date', 'Date')).toBeTruthy());
  it('returns error for empty string', () => expect(validateDate('', 'Date')).toBeTruthy());
});

describe('validateForm', () => {
  it('returns null when all fields pass', () => {
    const result = validateForm([['hello', 'Name'], ['a@b.com', 'Email', validateEmail]]);
    expect(result).toBeNull();
  });
  it('returns first error when a required field is empty', () => {
    const result = validateForm([['', 'Name']]);
    expect(result).toBe('Name is required.');
  });
});

describe('validateTaskStatusTransition', () => {
  it('allows assigned → acknowledged', () => expect(validateTaskStatusTransition('assigned', 'acknowledged')).toBe(true));
  it('disallows assigned → completed', () => expect(validateTaskStatusTransition('assigned', 'completed')).toBe(false));
  it('disallows reviewed → any', () => expect(validateTaskStatusTransition('reviewed', 'assigned')).toBe(false));
});

describe('validateDailyHours', () => {
  it('returns null when total is within limit', () => expect(validateDailyHours(4, 3, 8)).toBeNull());
  it('returns error when total exceeds limit', () => expect(validateDailyHours(6, 4, 8)).toBeTruthy());
  it('defaults max to 8 when not provided', () => expect(validateDailyHours(7, 2)).toBeTruthy());
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm run test
```

Expected: Errors — `validators` module not found.

- [ ] **Step 3: Create `utils/validators.ts`**

```ts
import type { TaskStatus } from '../js/shared/types';

type ValidatorFn = (value: string) => string | null;

export function validateRequired(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null) return `${fieldName} is required.`;
  if (typeof value === 'string' && value.trim() === '') return `${fieldName} is required.`;
  return null;
}

export function validateEmail(value: string): string | null {
  if (!value || !value.trim()) return 'Email is required.';
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(value.trim())) return 'Please enter a valid email address.';
  return null;
}

export function validatePassword(value: string): string | null {
  if (!value) return 'Password is required.';
  return null;
}

export function validateNumber(value: string, fieldName: string, min?: number, max?: number): string | null {
  const n = parseFloat(value);
  if (isNaN(n)) return `${fieldName} must be a number.`;
  if (min !== undefined && n < min) return `${fieldName} must be at least ${min}.`;
  if (max !== undefined && n > max) return `${fieldName} must be at most ${max}.`;
  return null;
}

export function validateDate(value: string, fieldName: string): string | null {
  if (!value) return `${fieldName} is required.`;
  if (isNaN(new Date(value).getTime())) return `${fieldName} is not a valid date.`;
  return null;
}

export function validateForm(fields: [unknown, string, ...ValidatorFn[]][]): string | null {
  const errors: string[] = [];
  for (const [value, fieldName, ...validators] of fields) {
    const err = validateRequired(value, fieldName);
    if (err) { errors.push(err); continue; }
    for (const vFn of validators) {
      const e = vFn(value as string);
      if (e) { errors.push(e); break; }
    }
  }
  return errors.length ? errors.join(' ') : null;
}

export function validateTaskStatusTransition(current: TaskStatus, next: TaskStatus): boolean {
  const allowed: Record<TaskStatus, TaskStatus[]> = {
    assigned:     ['acknowledged'],
    acknowledged: ['in_progress'],
    in_progress:  ['completed'],
    completed:    ['reviewed'],
    reviewed:     [],
  };
  return (allowed[current] ?? []).includes(next);
}

export function validateDailyHours(existingHours: number, newHours: number, max = 8): string | null {
  const total = existingHours + newHours;
  if (total > max) return `Cannot log ${newHours}h — total would be ${total}h (max is ${max}h per day).`;
  return null;
}
```

- [ ] **Step 4: Delete old file**

```bash
git rm utils/validators.js
```

- [ ] **Step 5: Run tests — confirm they pass**

```bash
npm run test
```

Expected: All `validators` tests pass.

- [ ] **Step 6: Commit**

```bash
git add utils/validators.ts utils/validators.test.ts
git commit -m "feat: convert validators to TypeScript with unit tests"
```

---

### Task 9: Type config/roles.ts

**Files:**
- Create: `config/roles.ts`
- Delete: `config/roles.js`

**Interfaces:**
- Produces: `ROLES`, `PERMISSIONS`, `ROLE_HIERARCHY`, `ROLE_LABELS`, `ROUTES`, `hasPermission`, `isAdmin`, `isSupervisor`, `isIntern`, `isStaff`, `isAtLeast`
- No tests needed — pure typed constants; correctness enforced by TypeScript

- [ ] **Step 1: Create `config/roles.ts`**

```ts
import type { UserRole } from '../js/shared/types';

export const ROLES = {
  ADMIN:      'admin',
  SUPERVISOR: 'supervisor',
  INTERN:     'intern',
} as const;

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin:      3,
  supervisor: 2,
  intern:     1,
};

type Resource = 'tasks' | 'timesheets' | 'outputs' | 'dashboard' | 'approvals' | 'interns' | 'reports';

export const PERMISSIONS: Record<UserRole, Partial<Record<Resource, string[]>>> = {
  intern: {
    tasks:      ['view_own', 'update_own'],
    timesheets: ['view_own', 'create_own', 'update_own'],
    outputs:    ['view_own'],
    dashboard:  ['view_own'],
  },
  supervisor: {
    tasks:      ['view_all', 'create', 'update_all', 'review'],
    timesheets: ['view_all', 'approve', 'reject'],
    outputs:    ['view_all'],
    dashboard:  ['view_own', 'view_team'],
    approvals:  ['view', 'approve', 'reject'],
  },
  admin: {
    tasks:      ['view_all', 'create', 'update_all', 'review'],
    timesheets: ['view_all', 'approve', 'reject'],
    outputs:    ['view_all'],
    dashboard:  ['view_own', 'view_team', 'view_all'],
    approvals:  ['view', 'approve', 'reject'],
    interns:    ['view', 'manage'],
    reports:    ['view', 'export'],
  },
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin:      'Admin',
  supervisor: 'Supervisor',
  intern:     'Intern',
};

export const ROUTES = {
  HQ:     'index.html',
  INTERN: 'intern.html',
  LOGIN:  'login.html',
} as const;

export function hasPermission(role: UserRole, resource: Resource, action: string): boolean {
  const perms = PERMISSIONS[role];
  if (!perms?.[resource]) return false;
  return perms[resource]!.includes(action) || perms[resource]!.includes('*');
}

export const isAdmin      = (role: UserRole): boolean => role === 'admin';
export const isSupervisor = (role: UserRole): boolean => role === 'supervisor';
export const isIntern     = (role: UserRole): boolean => role === 'intern';
export const isStaff      = (role: UserRole): boolean => isAdmin(role) || isSupervisor(role);
export const isAtLeast    = (role: UserRole, minimum: UserRole): boolean =>
  (ROLE_HIERARCHY[role] ?? 0) >= (ROLE_HIERARCHY[minimum] ?? 0);
```

- [ ] **Step 2: Delete old file**

```bash
git rm config/roles.js
```

- [ ] **Step 3: Run full test suite and type check**

```bash
npm run test
npx tsc --noEmit
```

Expected: All tests pass. Zero TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add config/roles.ts
git commit -m "feat: convert roles config to typed TypeScript constants"
```

---

## Plan 1 Complete ✓

Run the full verification suite:

```bash
npm run test
npm run lint
npx tsc --noEmit
```

All three must exit with code 0 before proceeding to Plan 2.

**Plan 2 covers:** `js/shared/` typed components, `js/shared/state.ts` (replaces all globals), page module migration (`js/intern/`, `js/hq/`), and enabling `strict: true` globally.
