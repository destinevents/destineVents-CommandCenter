# Code Quality Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete dead code, reorganize ICC/app.js, enable TypeScript strict mode, and expand test coverage from ~10% to ~60% line coverage.

**Architecture:** Three sequential phases — structural cleanup (dead files, reorganize), TypeScript tightening (strict mode), then test expansion. Pure calculation functions are extracted into `.ts` shim files alongside their `.js` originals so Vitest can import and test them without requiring an ES module migration. The `.js` originals remain unchanged for browser script-tag use.

**Tech Stack:** Vanilla JS (browser globals via `<script>` tags), TypeScript, Vite, Vitest, Supabase.

## Global Constraints

- No ES module migration — HTML `<script>` tags are not changed
- No UI component changes or DOM rendering tests
- All new test files are `.test.ts` using Vitest
- Supabase mocked with: `vi.mock('./supabase', () => ({ sb: { from: vi.fn() } }))`
- Test run: `npx vitest run` · Coverage: `npx vitest run --coverage` · Type check: `npx tsc --noEmit`
- `checkJs` stays `false` — JS files are not type-checked

---

### Task 1: Delete dead HQ/hq/ folder

**Files:**
- Delete: `HQ/hq/` (entire folder — 6 files, never referenced)

- [ ] **Step 1: Verify no file references HQ/hq/**

```bash
grep -r "HQ/hq" . --include="*.html" --include="*.js" --include="*.ts"
```
Expected: no output (zero references)

- [ ] **Step 2: Delete the folder**

```bash
rm -rf HQ/hq
```

- [ ] **Step 3: Verify HQ portal still works**

Open `index.html` in a browser (or `npx vite`). Navigate Dashboard, CRM, Finance, Operations tabs — all should load without console errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: delete dead HQ/hq duplicate folder"
```

---

### Task 2: Reorganize ICC/app.js into labeled sections

**Files:**
- Modify: `ICC/app.js` (reorder only — zero logic changes)

- [ ] **Step 1: Identify current positions of each function**

```bash
grep -n "^async function\|^function\|^let \|^const PAGE_DATA\|^document\." ICC/app.js
```

- [ ] **Step 2: Reorder the file into these labeled sections**

Cut and paste functions into this order, adding section headers. **Do not modify any function body.**

```
// ─── GLOBAL STATE ────────────────────────────────────────────────────────────
let currentUser, activePage, sheetFilter, taskFilter, sidebarOpen, pendingRejectId
let liveUsers, liveTasks, liveTimesheets

// ─── UTILITY FUNCTIONS ───────────────────────────────────────────────────────
user(), myTasks(), mySheets(), pendingApprovals()
toast(), handleError(), openModal(), closeModal()

// ─── UI HELPERS ──────────────────────────────────────────────────────────────
applyRoleVisibility(), toggleSidebar(), updateBadges()

// ─── DATA LOADING ────────────────────────────────────────────────────────────
loadLiveTasks(), loadLiveUsers(), loadLiveTimesheets()

// ─── PAGE ROUTING ────────────────────────────────────────────────────────────
PAGE_DATA constant, goPage(), renderPage()

// ─── REALTIME ────────────────────────────────────────────────────────────────
setupRealtime()

// ─── EVENT DELEGATION ────────────────────────────────────────────────────────
document.querySelectorAll('.modal-overlay').forEach(...)
document.getElementById('sidebar-nav').addEventListener(...)
document.addEventListener('click', ...)

// ─── INITIALIZATION ──────────────────────────────────────────────────────────
handleSignOut(), init(), init()  ← call at bottom
```

- [ ] **Step 3: Verify no logic changed**

```bash
git diff ICC/app.js
```
Confirm: only line positions changed, no function body additions or removals.

- [ ] **Step 4: Open intern portal and navigate all pages**

Dashboard, Tasks, Timesheets, Approvals, Interns, Reports — all should render without console errors.

- [ ] **Step 5: Commit**

```bash
git add ICC/app.js
git commit -m "refactor: organize ICC/app.js into labeled sections"
```

---

### Task 3: Service naming audit

**Files:**
- Possibly modify: files in `services/`

- [ ] **Step 1: List all service function names**

```bash
grep -n "^async function\|^function" services/*.js services/*.ts
```

Expected pattern: all names follow `verbNoun` camelCase — `fetchClients`, `createInvoice`, `calcWinRate`, etc. If everything already matches, skip to Step 3.

- [ ] **Step 2: Rename any inconsistent function and update all call sites**

For each name that doesn't match `verbNoun` (e.g. `getInvoices` → `fetchInvoices`):

```bash
# Find every call site before renaming:
grep -rn "oldFunctionName" . --include="*.js" --include="*.ts" --include="*.html"
```

Update the definition and every call site.

- [ ] **Step 3: Commit (only if changes were made)**

```bash
git add -A
git commit -m "refactor: align service function names to verbNoun convention"
```

If no changes were needed, no commit required.

---

### Task 4: Verify error handling + enable TypeScript strict mode

**Files:**
- Modify: `tsconfig.json`
- Modify: any `.ts` file with type errors after enabling strict

- [ ] **Step 1: Verify JS services already have error handling**

```bash
grep -n "handleServiceError\|logger.error" services/*.js
```

Expected: every Supabase-calling function in `clientService.js`, `financeService.js`, `proposalService.js` shows a `handleServiceError` call. `handleServiceError` (in `utils/errorHandler.js`) already calls `logger.error` and shows a toast — no changes needed to JS services.

- [ ] **Step 2: Enable strict mode in tsconfig.json**

Edit `tsconfig.json` — change only these two lines:
```json
"strict": true,
"checkJs": false,
```
(`checkJs` must remain `false` — JS files are not type-checked in this phase.)

- [ ] **Step 3: Run tsc and see all errors**

```bash
npx tsc --noEmit 2>&1
```

- [ ] **Step 4: Fix every reported error**

Common patterns and their fixes:

**Implicit `any` in callbacks:**
```ts
// Error: Parameter 'x' implicitly has an 'any' type
// Fix A — use existing type from js/shared/types.ts:
import type { Task } from '../js/shared/types';
.filter((t: Task) => t.status === 'pending')

// Fix B — explicit any when type is not worth importing:
.filter((t: any) => t.status === 'pending')
```

**Object possibly `undefined`:**
```ts
// Error: Object is possibly 'undefined'
// Fix — use optional chaining or null coalescing:
const result = data?.[0] ?? null;
```

**Missing return type on exported function:**
```ts
// Fix — add explicit return type:
export async function fetchTasks(role: string, userId: string): Promise<Task[]> {
```

- [ ] **Step 5: Run tsc again — confirm zero errors**

```bash
npx tsc --noEmit
```
Expected: no output, exit code 0.

- [ ] **Step 6: Run existing tests — confirm nothing broke**

```bash
npx vitest run
```
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add tsconfig.json
git add services/*.ts utils/*.ts
git commit -m "feat: enable TypeScript strict mode and fix type errors"
```

---

### Task 5: Expand validator test coverage

**Files:**
- Modify: `utils/validators.test.ts`

- [ ] **Step 1: Add edge case tests**

Append to the end of `utils/validators.test.ts`:

```ts
describe('validatePassword — edge cases', () => {
  it('returns error for exactly 7 characters (boundary below minimum)', () =>
    expect(validatePassword('Abc@123')).toBeTruthy());

  it('returns null for exactly 8 characters (minimum boundary)', () =>
    expect(validatePassword('Abcd@123')).toBeNull());

  it('returns error when missing lowercase (all uppercase + special + digit)', () =>
    expect(validatePassword('ABCD@123')).toBeTruthy());

  it('returns error when missing uppercase (all lowercase + special + digit)', () =>
    expect(validatePassword('abcd@123')).toBeTruthy());

  it('returns error when missing special character', () =>
    expect(validatePassword('Abcde123')).toBeTruthy());

  it('returns error for whitespace-only string', () =>
    expect(validatePassword('        ')).toBeTruthy());
});

describe('validateRequired — edge cases', () => {
  it('returns error for whitespace-only string', () =>
    expect(validateRequired('   ')).toBeTruthy());

  it('returns error for null', () =>
    expect(validateRequired(null as any)).toBeTruthy());

  it('returns error for undefined', () =>
    expect(validateRequired(undefined as any)).toBeTruthy());

  it('returns null for a single non-space character', () =>
    expect(validateRequired('a')).toBeNull());
});
```

- [ ] **Step 2: Run the tests**

```bash
npx vitest run utils/validators.test.ts
```
Expected: all tests pass (including the new ones).

- [ ] **Step 3: Commit**

```bash
git add utils/validators.test.ts
git commit -m "test: add boundary and edge case coverage for validators"
```

---

### Task 6: Expand timesheetService test coverage

**Files:**
- Modify: `services/timesheetService.test.ts`

- [ ] **Step 1: Read the current test file to see what's already covered**

```bash
cat services/timesheetService.test.ts
```

- [ ] **Step 2: Add missing tests**

Append to `services/timesheetService.test.ts` (after any existing imports / `beforeEach` — do not duplicate them):

```ts
describe('fetchTimesheets', () => {
  it('returns all timesheets for admin (no filter applied)', async () => {
    const sheets = [{ id: 's1', intern_id: 'u1', status: 'pending', hours: 4 }];
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: sheets, error: null }),
    };
    mockFrom.mockReturnValue(chain);
    const result = await fetchTimesheets('admin', 'u1');
    expect(result).toEqual(sheets);
  });

  it('returns empty array on Supabase error', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: 'db error' } }),
    };
    mockFrom.mockReturnValue(chain);
    const result = await fetchTimesheets('admin', 'u1');
    expect(result).toEqual([]);
  });

  it('applies intern_id eq filter for intern role', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    mockFrom.mockReturnValue(chain);
    await fetchTimesheets('intern', 'u99');
    expect(chain.eq).toHaveBeenCalledWith('intern_id', 'u99');
  });
});

describe('createTimesheet', () => {
  it('returns created timesheet on success', async () => {
    const sheet = { id: 's1', intern_id: 'u1', hours: 4, status: 'pending' };
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [sheet], error: null }),
    };
    mockFrom.mockReturnValue(chain);
    const result = await createTimesheet({ intern_id: 'u1', hours: 4 });
    expect(result).toEqual(sheet);
  });

  it('returns null on error', async () => {
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
    };
    mockFrom.mockReturnValue(chain);
    const result = await createTimesheet({ intern_id: 'u1', hours: 4 });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests**

```bash
npx vitest run services/timesheetService.test.ts
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add services/timesheetService.test.ts
git commit -m "test: expand timesheetService coverage (fetch filter + create error path)"
```

---

### Task 7: Test finance calculation functions

The pure function `calcFinanceSummary` lives in `financeService.js` — a browser-global script without exports. Create a `.ts` shim that exports the identical logic so Vitest can import it. The `.js` file is not changed.

**Files:**
- Create: `services/financeCalc.ts`
- Create: `services/financeCalc.test.ts`

- [ ] **Step 1: Create services/financeCalc.ts**

```ts
export function calcFinanceSummary(invoices: any[], bills: any[]) {
  const arOutstanding = invoices
    .filter(i => i.status !== 'Paid')
    .reduce((s, i) => s + (i.amount || 0), 0);
  const apOutstanding = bills
    .filter(b => b.status !== 'Paid')
    .reduce((s, b) => s + (b.amount || 0), 0);
  const revenueCollected = invoices
    .filter(i => i.status === 'Paid')
    .reduce((s, i) => s + (i.amount || 0), 0);
  const overdueInvoices = invoices.filter(i => i.status === 'Overdue');
  const pendingBills = bills.filter(b => b.status !== 'Paid');
  return {
    arOutstanding,
    apOutstanding,
    netPosition: revenueCollected - apOutstanding,
    revenueCollected,
    overdueCount: overdueInvoices.length,
    overdueTotal: overdueInvoices.reduce((s, i) => s + (i.amount || 0), 0),
    pendingBillsCount: pendingBills.length,
  };
}
```

- [ ] **Step 2: Create services/financeCalc.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { calcFinanceSummary } from './financeCalc';

const inv = (status: string, amount: number) => ({ status, amount });
const bill = (status: string, amount: number) => ({ status, amount });

describe('calcFinanceSummary', () => {
  it('calculates AR outstanding from unpaid invoices only', () => {
    const result = calcFinanceSummary([inv('Unpaid', 5000), inv('Paid', 3000)], []);
    expect(result.arOutstanding).toBe(5000);
  });

  it('calculates revenue collected from paid invoices only', () => {
    const result = calcFinanceSummary([inv('Paid', 3000), inv('Unpaid', 1000)], []);
    expect(result.revenueCollected).toBe(3000);
  });

  it('calculates net position as revenue minus AP outstanding', () => {
    const result = calcFinanceSummary([inv('Paid', 5000)], [bill('Unpaid', 2000)]);
    expect(result.netPosition).toBe(3000);
  });

  it('counts overdue invoices and sums their amounts', () => {
    const result = calcFinanceSummary(
      [inv('Overdue', 1500), inv('Overdue', 500), inv('Paid', 1000)],
      []
    );
    expect(result.overdueCount).toBe(2);
    expect(result.overdueTotal).toBe(2000);
  });

  it('returns zeros when both arrays are empty', () => {
    const result = calcFinanceSummary([], []);
    expect(result.arOutstanding).toBe(0);
    expect(result.revenueCollected).toBe(0);
    expect(result.overdueCount).toBe(0);
  });

  it('treats missing amount field as zero', () => {
    const result = calcFinanceSummary([{ status: 'Unpaid' }], []);
    expect(result.arOutstanding).toBe(0);
  });
});
```

- [ ] **Step 3: Run the tests**

```bash
npx vitest run services/financeCalc.test.ts
```
Expected: 6 tests pass.

- [ ] **Step 4: Commit**

```bash
git add services/financeCalc.ts services/financeCalc.test.ts
git commit -m "test: add finance calculation tests via exported TS shim"
```

---

### Task 8: Test proposal and client calculation functions

**Files:**
- Create: `services/proposalCalc.ts`
- Create: `services/proposalCalc.test.ts`
- Create: `services/clientCalc.ts`
- Create: `services/clientCalc.test.ts`

- [ ] **Step 1: Create services/proposalCalc.ts**

```ts
export function calcWinRate(proposals: any[]) {
  const closed = proposals.filter(p => p.status === 'Won' || p.status === 'Lost');
  const won = proposals.filter(p => p.status === 'Won');
  const wonValue = won.reduce((s, p) => s + (p.value || 0), 0);
  const pipelineValue = proposals
    .filter(p => p.status === 'Sent')
    .reduce((s, p) => s + (p.value || 0), 0);
  return {
    total: proposals.length,
    closed: closed.length,
    won: won.length,
    lost: proposals.filter(p => p.status === 'Lost').length,
    winRate: closed.length ? Math.round((won.length / closed.length) * 100) : 0,
    wonValue,
    pipelineValue,
  };
}
```

- [ ] **Step 2: Create services/proposalCalc.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { calcWinRate } from './proposalCalc';

const p = (status: string, value = 0) => ({ status, value });

describe('calcWinRate', () => {
  it('calculates win rate as percentage of closed proposals', () => {
    const result = calcWinRate([p('Won'), p('Won'), p('Lost')]);
    expect(result.winRate).toBe(67);
  });

  it('returns 0 win rate when no proposals are closed', () => {
    const result = calcWinRate([p('Sent'), p('Sent')]);
    expect(result.winRate).toBe(0);
  });

  it('sums pipeline value from Sent proposals only', () => {
    const result = calcWinRate([p('Sent', 5000), p('Won', 3000), p('Sent', 2000)]);
    expect(result.pipelineValue).toBe(7000);
  });

  it('counts total, won, and lost correctly', () => {
    const result = calcWinRate([p('Won'), p('Lost'), p('Sent'), p('Expired')]);
    expect(result.total).toBe(4);
    expect(result.won).toBe(1);
    expect(result.lost).toBe(1);
  });

  it('returns zeros for empty array', () => {
    const result = calcWinRate([]);
    expect(result.total).toBe(0);
    expect(result.winRate).toBe(0);
  });
});
```

- [ ] **Step 3: Create services/clientCalc.ts**

```ts
export function getClientTotalValue(clients: any[]): number {
  return clients.reduce((s, c) => s + (c.total_value || 0), 0);
}

export function findClientByName(
  name: string | null | undefined,
  clients: any[]
): any | null {
  if (!name || !clients) return null;
  return clients.find(c => c.name?.toLowerCase() === name.toLowerCase()) || null;
}
```

- [ ] **Step 4: Create services/clientCalc.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { getClientTotalValue, findClientByName } from './clientCalc';

describe('getClientTotalValue', () => {
  it('sums total_value from all clients', () => {
    expect(getClientTotalValue([{ total_value: 100 }, { total_value: 200 }])).toBe(300);
  });
  it('treats missing total_value as zero', () => {
    expect(getClientTotalValue([{ name: 'ACME' }])).toBe(0);
  });
  it('returns 0 for empty array', () => {
    expect(getClientTotalValue([])).toBe(0);
  });
});

describe('findClientByName', () => {
  const clients = [{ name: 'Acme Corp' }, { name: 'Beta Ltd' }];

  it('finds client by exact name (case-insensitive)', () => {
    expect(findClientByName('acme corp', clients)).toEqual({ name: 'Acme Corp' });
  });
  it('returns null when client is not found', () => {
    expect(findClientByName('Unknown', clients)).toBeNull();
  });
  it('returns null for null name', () => {
    expect(findClientByName(null, clients)).toBeNull();
  });
  it('returns null for empty string name', () => {
    expect(findClientByName('', clients)).toBeNull();
  });
});
```

- [ ] **Step 5: Run all new tests**

```bash
npx vitest run services/proposalCalc.test.ts services/clientCalc.test.ts
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add services/proposalCalc.ts services/proposalCalc.test.ts services/clientCalc.ts services/clientCalc.test.ts
git commit -m "test: add proposal and client calculation tests via exported TS shims"
```

---

### Task 9: Test CSV report generation functions

**Files:**
- Create: `lib/business/reportCalc.ts`
- Create: `lib/business/reportCalc.test.ts`

- [ ] **Step 1: Create lib/business/reportCalc.ts**

```ts
export function generateCSV(headers: string[], rows: any[][]): string {
  const esc = (v: any): string => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? '"' + s.replace(/"/g, '""') + '"'
      : s;
  };
  return [headers.join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
}

export function generateTimesheetCSV(
  timesheets: any[],
  tasks: any[],
  users: any[]
): { headers: string[]; rows: any[][] } {
  const headers = ['Intern', 'Date', 'Task', 'Activity', 'Hours', 'Category', 'Skills', 'Status'];
  const rows = timesheets.map(ts => {
    const task = tasks.find((t: any) => t.id === ts.task_id);
    const intern = users.find((u: any) => u.id === ts.intern_id);
    return [
      intern?.name || '—',
      ts.date,
      task?.title || '—',
      ts.activity_description || '',
      ts.hours,
      ts.industry_category || '',
      (ts.skills || []).join('; '),
      ts.status,
    ];
  });
  return { headers, rows };
}
```

- [ ] **Step 2: Create lib/business/reportCalc.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { generateCSV, generateTimesheetCSV } from './reportCalc';

describe('generateCSV', () => {
  it('produces a header row and data rows joined by newlines', () => {
    const csv = generateCSV(['Name', 'Age'], [['Alice', 30], ['Bob', 25]]);
    expect(csv).toBe('Name,Age\nAlice,30\nBob,25');
  });

  it('wraps values containing commas in double quotes', () => {
    const csv = generateCSV(['Val'], [['hello, world']]);
    expect(csv).toContain('"hello, world"');
  });

  it('escapes double quotes inside values', () => {
    const csv = generateCSV(['Val'], [['"quoted"']]);
    expect(csv).toContain('""quoted""');
  });

  it('converts null and undefined to empty string', () => {
    const csv = generateCSV(['A', 'B'], [[null, undefined]]);
    expect(csv).toBe('A,B\n,');
  });
});

describe('generateTimesheetCSV', () => {
  const timesheets = [{
    id: 'ts1', intern_id: 'u1', task_id: 't1',
    date: '2026-07-01', activity_description: 'Built feature',
    hours: 4, industry_category: 'Tech', skills: ['JS', 'React'], status: 'approved',
  }];
  const tasks = [{ id: 't1', title: 'Feature X' }];
  const users = [{ id: 'u1', name: 'Alice Santos' }];

  it('returns the correct 8-column header row', () => {
    const { headers } = generateTimesheetCSV(timesheets, tasks, users);
    expect(headers).toEqual(['Intern', 'Date', 'Task', 'Activity', 'Hours', 'Category', 'Skills', 'Status']);
  });

  it('resolves intern name from users array', () => {
    const { rows } = generateTimesheetCSV(timesheets, tasks, users);
    expect(rows[0][0]).toBe('Alice Santos');
  });

  it('resolves task title from tasks array', () => {
    const { rows } = generateTimesheetCSV(timesheets, tasks, users);
    expect(rows[0][2]).toBe('Feature X');
  });

  it('joins skills array with semicolons', () => {
    const { rows } = generateTimesheetCSV(timesheets, tasks, users);
    expect(rows[0][6]).toBe('JS; React');
  });

  it('uses em dash for a missing task reference', () => {
    const { rows } = generateTimesheetCSV(
      [{ ...timesheets[0], task_id: 'missing' }],
      [],
      users
    );
    expect(rows[0][2]).toBe('—');
  });

  it('uses em dash for a missing intern reference', () => {
    const { rows } = generateTimesheetCSV(
      [{ ...timesheets[0], intern_id: 'missing' }],
      tasks,
      []
    );
    expect(rows[0][0]).toBe('—');
  });
});
```

- [ ] **Step 3: Run the tests**

```bash
npx vitest run lib/business/reportCalc.test.ts
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add lib/business/reportCalc.ts lib/business/reportCalc.test.ts
git commit -m "test: add CSV generation tests via exported TS shim"
```

---

### Task 10: Test format and date utility functions

**Files:**
- Create: `utils/formatUtils.ts`
- Create: `utils/formatUtils.test.ts`
- Create: `utils/dateUtils.ts`
- Create: `utils/dateUtils.test.ts`

- [ ] **Step 1: Create utils/formatUtils.ts**

```ts
export function formatCurrency(n: any): string {
  const v = +(n) || 0;
  return '₱' + v.toLocaleString('en-PH');
}

export function formatNumber(n: any): string {
  return (+(n) || 0).toLocaleString('en-PH');
}

export function formatBytes(b: number): string {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return Math.round(b / 1024) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}

export function formatPercentage(n: number, total: number): string {
  if (!total) return '0%';
  return Math.round((n / total) * 100) + '%';
}

export function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural || singular + 's');
}
```

- [ ] **Step 2: Create utils/formatUtils.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { formatCurrency, formatBytes, formatPercentage, capitalize, pluralize } from './formatUtils';

describe('formatCurrency', () => {
  it('formats a positive number with peso sign', () => {
    expect(formatCurrency(1000)).toContain('₱');
  });
  it('treats null as zero', () => {
    const result = formatCurrency(null);
    expect(result).toContain('₱');
    expect(result).toContain('0');
  });
  it('treats a non-numeric string as zero', () => {
    expect(formatCurrency('abc')).toContain('0');
  });
  it('handles zero correctly', () => {
    expect(formatCurrency(0)).toContain('0');
  });
});

describe('formatBytes', () => {
  it('returns bytes for values under 1 KB', () => {
    expect(formatBytes(500)).toBe('500 B');
  });
  it('returns KB for values between 1 KB and 1 MB', () => {
    expect(formatBytes(2048)).toBe('2 KB');
  });
  it('returns MB with one decimal for larger values', () => {
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });
});

describe('formatPercentage', () => {
  it('calculates correct percentage', () => {
    expect(formatPercentage(1, 4)).toBe('25%');
  });
  it('returns 0% when total is zero (avoids divide-by-zero)', () => {
    expect(formatPercentage(5, 0)).toBe('0%');
  });
  it('rounds to nearest integer', () => {
    expect(formatPercentage(1, 3)).toBe('33%');
  });
});

describe('capitalize', () => {
  it('capitalizes the first letter', () => {
    expect(capitalize('hello')).toBe('Hello');
  });
  it('returns empty string for empty input', () => {
    expect(capitalize('')).toBe('');
  });
  it('does not change an already-capitalized string', () => {
    expect(capitalize('Hello')).toBe('Hello');
  });
});

describe('pluralize', () => {
  it('returns singular form when count is 1', () => {
    expect(pluralize(1, 'task')).toBe('task');
  });
  it('appends s when count is 0', () => {
    expect(pluralize(0, 'task')).toBe('tasks');
  });
  it('appends s when count is greater than 1', () => {
    expect(pluralize(5, 'task')).toBe('tasks');
  });
  it('uses provided plural form instead of appending s', () => {
    expect(pluralize(2, 'person', 'people')).toBe('people');
  });
});
```

- [ ] **Step 3: Create utils/dateUtils.ts**

```ts
export function formatDate(
  isoVal: string | null | undefined,
  locale?: string,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!isoVal) return '—';
  return new Date(isoVal + 'T12:00:00').toLocaleDateString(locale || 'en-US', options || {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function formatDateShort(isoVal: string | null | undefined): string {
  return formatDate(isoVal, 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateForNDA(isoVal: string | null | undefined): string {
  return formatDate(isoVal, 'en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getQuarter(date?: Date): string {
  const d = date || new Date();
  return 'Q' + (Math.floor(d.getMonth() / 3) + 1) + ' ' + d.getFullYear();
}
```

- [ ] **Step 4: Create utils/dateUtils.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { formatDate, formatDateShort, formatDateForNDA, todayISO, getQuarter } from './dateUtils';

describe('formatDate', () => {
  it('returns em dash for null', () => {
    expect(formatDate(null)).toBe('—');
  });
  it('returns em dash for undefined', () => {
    expect(formatDate(undefined)).toBe('—');
  });
  it('returns em dash for empty string', () => {
    expect(formatDate('')).toBe('—');
  });
  it('includes the year for a valid ISO date', () => {
    expect(formatDate('2026-07-01')).toContain('2026');
  });
  it('includes a month abbreviation for a valid ISO date', () => {
    expect(formatDate('2026-07-01')).toContain('Jul');
  });
});

describe('formatDateShort', () => {
  it('includes month abbreviation and year', () => {
    const result = formatDateShort('2026-01-15');
    expect(result).toContain('Jan');
    expect(result).toContain('2026');
  });
  it('returns em dash for null', () => {
    expect(formatDateShort(null)).toBe('—');
  });
});

describe('formatDateForNDA', () => {
  it('includes the full month name', () => {
    expect(formatDateForNDA('2026-07-01')).toContain('July');
  });
});

describe('todayISO', () => {
  it('returns a string in YYYY-MM-DD format', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('getQuarter', () => {
  it('returns Q1 for January', () => {
    expect(getQuarter(new Date('2026-01-15'))).toBe('Q1 2026');
  });
  it('returns Q3 for July', () => {
    expect(getQuarter(new Date('2026-07-01'))).toBe('Q3 2026');
  });
  it('returns Q4 for December', () => {
    expect(getQuarter(new Date('2026-12-01'))).toBe('Q4 2026');
  });
});
```

- [ ] **Step 5: Run all new tests**

```bash
npx vitest run utils/formatUtils.test.ts utils/dateUtils.test.ts
```
Expected: all tests pass.

- [ ] **Step 6: Run full test suite and check coverage**

```bash
npx vitest run --coverage
```
Expected: ≥60% line coverage across TypeScript files.

- [ ] **Step 7: Commit**

```bash
git add utils/formatUtils.ts utils/formatUtils.test.ts utils/dateUtils.ts utils/dateUtils.test.ts
git commit -m "test: add format and date utility tests via exported TS shims"
```
