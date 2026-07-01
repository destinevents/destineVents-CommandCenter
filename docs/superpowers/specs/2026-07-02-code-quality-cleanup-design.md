# Code Quality Cleanup — Design Spec
**Date:** 2026-07-02
**Status:** Approved

---

## Context

The destineVents-CommandCenter codebase is ~4,900 LoC, 94% plain JavaScript with 6% TypeScript. The immediate pain points are:
- Bugs reaching the browser before being caught
- Code that's hard to navigate as the project grows
- No error handling in JS services (silent failures)
- ~10% test coverage (4 test files)
- A dead duplicate folder (`HQ/hq/`) adding confusion

**Goal:** A codebase where bugs surface in tests and types before they hit the browser, and where any developer can navigate files without getting lost — without migrating to ES modules or rewriting UI components.

---

## Scope

**In scope:**
- Deleting dead files
- Reorganizing `ICC/app.js` internally
- Consistent service function naming
- Try/catch on all JS Supabase services
- Enabling `strict: true` in tsconfig for `.ts` files
- Expanding test coverage to ~60%

**Out of scope:**
- ES module migration
- Supabase abstraction layer
- UI component rewrites / DOM rendering tests
- Changes to HTML pages

---

## Phase 1 — Structural Cleanup

### 1a. Delete `HQ/hq/`
All 6 files (`app.js`, `crm.js`, `finance.js`, `operations.js`, `ai.js`, `hq.css`) are byte-for-byte identical to their counterparts in `HQ/`. `index.html` loads from `HQ/` only — `HQ/hq/` is never referenced. Delete the entire `HQ/hq/` folder.

### 1b. Reorganize `ICC/app.js` (338 lines)
Without ES modules, splitting into new files requires new `<script>` tags. Instead, reorganize the file into clearly labeled sections in this order:

1. **Global state** — module-level variables
2. **Utility functions** — `user()`, `myTasks()`, `toast()`, `handleError()`, `openModal()`, `closeModal()`
3. **UI helpers** — `applyRoleVisibility()`, `toggleSidebar()`, `updateBadges()`
4. **Data loading** — `loadLiveTasks()`, `loadLiveUsers()`, `loadLiveTimesheets()`
5. **Page routing** — `PAGE_DATA`, `goPage()`, `renderPage()`
6. **Realtime** — `setupRealtime()`
7. **Event delegation** — `document.addEventListener('click', ...)`
8. **Initialization** — `handleSignOut()`, `init()`

No logic changes — reorder only.

### 1c. Service naming convention
All exported service functions use `verbNoun` camelCase: `fetchClients`, `createClient`, `updateClient`, `deleteClient`. Audit `services/` for any inconsistencies and rename. Update all call sites.

---

## Phase 2 — Error Handling + TypeScript

### 2a. Wrap JS services in try/catch
Every async function in `services/*.js` that calls Supabase gets this pattern:

```js
async function fetchClients() {
  try {
    const { data, error } = await sb.from('clients').select('*');
    if (error) throw error;
    return data ?? [];
  } catch (err) {
    logger.error('fetchClients', err.message, err);
    return [];   // safe fallback — callers already handle empty arrays
  }
}
```

Mutation functions (`create*`, `update*`, `delete*`) return `null` on error (matching the existing pattern in `taskService.ts`).

**Files:** All `services/*.js` files — `clientService.js`, `financeService.js`, `proposalService.js`, and any others. The existing `.ts` service files (`authService.ts`, `taskService.ts`, `timesheetService.ts`) already have error handling and are not changed here.

### 2b. Enable `strict: true` in tsconfig
Change `tsconfig.json`:
```json
{
  "compilerOptions": {
    "strict": true,
    "checkJs": false
  }
}
```
`checkJs` stays `false` — we are not type-checking `.js` files in this phase.

Fix any type errors surfaced in the 4 existing `.ts` files (`authService.ts`, `taskService.ts`, `timesheetService.ts`, `validators.ts`). Expected issues: implicit `any` in callbacks, missing null checks on Supabase responses.

---

## Phase 3 — Test Expansion

**Target:** ~60% line coverage (Vitest default metric). Vitest is already configured. All new test files are TypeScript (`.test.ts`) and mirror the pattern in the existing 4 test files (mock Supabase at the module level, test error path + at least one happy path per function).

### New test files

| Test file | Source file | Coverage focus |
|-----------|-------------|----------------|
| `services/clientService.test.ts` | `clientService.js` | fetch returns `[]` on error; insert returns `null` on error; happy path data passthrough |
| `services/financeService.test.ts` | `financeService.js` | same pattern |
| `services/proposalService.test.ts` | `proposalService.js` | same pattern |
| `lib/business/dashboardStats.test.ts` | `dashboardStats.js` | stat calculations with known fixture data |
| `lib/business/reportGenerator.test.ts` | `reportGenerator.js` | output shape and content with mock timesheet data |
| `lib/business/ndaGenerator.test.ts` | `ndaGenerator.js` | HTML output contains expected name, date, company fields |
| `utils/date.test.ts` | `date.js` | null input, invalid date string, valid date formatting |
| `utils/format.test.ts` | `format.js` | currency formatting, number edge cases (zero, negative) |

### What stays untested (this phase)
DOM-rendering functions (`renderApprovals`, `renderInterns`, etc.) require jsdom configuration not currently in the test setup. Out of scope.

---

## Verification

**Phase 1:**
- `HQ/hq/` no longer exists in the repo
- `index.html` still loads and the HQ portal functions normally
- `ICC/app.js` has clear section comments; git diff shows no logic changes

**Phase 2:**
- `tsc --noEmit` passes with zero errors on `strict: true`
- All Supabase error paths in JS services call `logger.error` and return safe fallbacks
- Manually disconnecting from Supabase (or mocking a failure) shows toast errors instead of crashes

**Phase 3:**
- `vitest run --coverage` reports ≥60% overall coverage
- All new test files pass with zero skipped tests
