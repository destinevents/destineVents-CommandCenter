# Design: Code Quality & Architecture Modernization

**Date:** 2026-07-01
**Project:** destineVents-CommandCenter
**Scope:** Incremental migration to Vite + TypeScript + Vitest
**Status:** Approved

---

## Overview

Incrementally modernize the destineVents-CommandCenter codebase by introducing Vite as a bundler, TypeScript for type safety, and Vitest for testing — without changing the MPA structure, backend, or deployment pipeline. The app stays functional throughout the migration. Existing `.js` files coexist with new `.ts` files during the transition via `allowJs: true`.

---

## Section 1: Tooling Setup

### Tools Added

| Tool | Purpose | Config file |
|------|---------|-------------|
| Vite | Bundler + dev server | `vite.config.ts` |
| TypeScript | Type safety | `tsconfig.json` |
| Vitest | Unit + integration tests | `vitest.config.ts` (or via vite.config.ts) |
| ESLint | Linting (JS + TS) | `eslint.config.js` |
| Prettier | Code formatting | `.prettierrc` |

### Vite MPA Configuration

Four HTML entry points, each with a single `<script type="module">`:

```
index.html    → js/hq/app.ts
intern.html   → js/intern/app.ts
login.html    → js/login.ts
signup.html   → js/signup.ts
```

### TypeScript Configuration

- `allowJs: true` — existing `.js` files work immediately
- `checkJs: false` — no errors on unconverted JS files
- `strict: false` — each migrated `.ts` file is written to be strict-compatible from the start; `strict: true` is flipped globally in Phase 5 once all files are converted
- `target: ES2020`
- `moduleResolution: bundler`

### Dev Commands

```
npm run dev    → Vite dev server (replaces opening HTML directly in browser)
npm run build  → Production build → dist/
npm run test   → Vitest (watch mode)
npm run lint   → ESLint
npm run format → Prettier
```

### What Does NOT Change

- MPA structure (4 separate HTML pages)
- Supabase backend and database
- Vercel deployment (Vite outputs to `dist/`, Vercel picks it up)
- CSS files
- No UI framework introduced

---

## Section 2: Migration Order

Migration runs **bottom-up** — layers with no DOM dependency are converted first. Each phase keeps the app working.

### Phase 1 — Tooling Bootstrap
- Install and configure Vite, TypeScript, Vitest, ESLint, Prettier
- Wire 4 HTML entry points to Vite
- Verify the app runs under `npm run dev` with zero code changes

### Phase 2 — Foundation Layers

Convert in this order (no DOM, easiest to type and test):

1. `services/supabase.js` → generate Supabase database types; typed `sb` client
2. `services/*.js` → explicit return types: `Promise<{ data: T | null; error: PostgrestError | null }>`
3. `utils/*.js` → typed inputs and outputs for all pure functions
4. `config/roles.js` → `ROLES`, `PERMISSIONS`, `ROLE_HIERARCHY` typed with `as const`
5. `config/settings.js` → typed `APP_SETTINGS` object

### Phase 3 — Shared Components

- `js/shared/utils.ts` — type `escapeHtml`, `formatCurrency`, etc.
- `js/shared/constants.ts` — type `KANBAN_COLS`, `STATUS_LABELS`, etc.
- `js/shared/components/*.ts` — type each UI component helper

### Phase 4 — Page Modules

Convert intern and HQ page modules last (these touch the DOM and reference globals).

**Global state refactor (done in this phase):**
Replace mutable globals (`currentUser`, `liveTasks`, `liveInterns`, etc.) with a typed state module:

```ts
// js/shared/state.ts
export const state = {
  currentUser: null as InternUser | null,
  liveTasks: [] as Task[],
  liveInterns: [] as InternUser[],
};
```

Both portals import from `state.ts` instead of reading globals. This eliminates implicit coupling and makes module dependencies explicit.

Migration order within Phase 4:
1. `js/intern/app.ts` — router and auth init
2. `js/intern/*.ts` — page modules (dashboard, tasks, timesheets, outputs, admin, account)
3. `js/hq/app.ts` — router and auth init
4. `js/hq/*.ts` — page modules (crm, finance, operations, ai)

### Phase 5 — Enable Strict Mode

- Set `strict: true` in `tsconfig.json`
- Fix remaining type errors file by file
- Remove `allowJs` once all files are `.ts`

---

## Section 3: Testing Strategy

### Unit Tests — `services/` and `utils/`

- **Supabase mock:** a simple object that returns controlled `{ data, error }` — no real DB calls
- **Coverage target:** every service function has at least one happy-path and one error-path test
- **Utils:** pure functions, no mocks needed

### Integration Tests — Critical Flows

Three flows get integration-level coverage:

| Flow | What is tested |
|------|---------------|
| Auth | login → session → `getCurrentUser()` returns correct role |
| Timesheet | create → admin approve → status transitions correctly |
| Task | task moves through kanban column statuses correctly |

### E2E Tests — User Journeys

Using ECC Chrome DevTools MCP:

| Journey | Steps |
|---------|-------|
| Intern signup + log hours | Sign up → log in → navigate to Timesheets → submit hours |
| Admin approves timesheet | Log in as admin → Approvals page → approve a pending sheet |

### Out of Scope (for now)

- DOM rendering functions (`renderTasks`, `renderDashboard`, etc.) — tested after Phase 4 untangles globals
- CSS / visual regression

### File Convention

Tests live next to source files:

```
services/authService.ts
services/authService.test.ts
utils/validators.ts
utils/validators.test.ts
```

---

## Constraints & Decisions

| Decision | Rationale |
|----------|-----------|
| Incremental over big-bang | App stays working throughout; lower risk |
| `allowJs: true` first | No forced migration; convert at own pace |
| `strict: false` initially | Avoids overwhelming errors on first TS run |
| Vitest over Jest | Zero-config with Vite; same API |
| No UI framework | Scope is quality/architecture, not a rewrite |
| State module over global variables | Makes dependencies explicit; enables testing |

---

## Success Criteria

- [ ] `npm run dev` serves all 4 pages correctly
- [ ] `npm run build` produces a working `dist/` deployable to Vercel
- [ ] All `services/` and `utils/` files converted to `.ts` with explicit types
- [ ] Vitest runs with at least one test per service function
- [ ] 3 integration flows covered
- [ ] 2 E2E journeys covered
- [ ] `strict: true` enabled with zero type errors
- [ ] No regressions in existing functionality
