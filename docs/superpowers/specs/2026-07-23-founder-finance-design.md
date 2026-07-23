# Founder Finance — Design Spec

Date: 2026-07-23

## Purpose

A new, admin-only ("founder") area in the HQ app that tracks actual cash movement
and founder equity — separate from the existing operational Finance tab
(AR/AP/Payroll/BIR, which is invoice- and bill-driven). Modeled after a
reference screenshot showing a "Finances" table of contents with four
sections: Cash Ledger, Founder Capital, Monthly Summary, Projections.

## Access control

- New top-level nav item, `data-page="founder-finance"`.
- Visible only to the `admin` role. `applyHQRoleAccess()` in
  `apps/hq/core/app.ts` already hides any `.nav-item[data-page]` not present
  in `HQ_ALLOWED_PAGES[role]` for non-admin roles, and returns early
  (no hiding at all) for `admin`. The new page is intentionally **not**
  added to `HQ_ALLOWED_PAGES`, so it is invisible to
  `finance_officer` / `external_accountant` / `team_staff` without any new
  permission logic.
- Database-level enforcement via Row Level Security, using the existing
  `public.current_user_role()` SECURITY DEFINER helper
  (`database/migrations/003_rls_helpers.sql`): all `select`/`insert`/
  `update`/`delete` policies on the new tables require
  `current_user_role() = 'admin'`.

## Data model

New migration, e.g. `database/migrations/015_founder_finance.sql`.

### `cash_ledger_entries`

| column | type | notes |
|---|---|---|
| id | bigint identity PK | |
| date | date | not null |
| description | text | not null |
| category | text | check in `('Client Payment','Founder Draw','Founder Contribution','Expense','Transfer','Other')` |
| direction | text | check in `('in','out')` |
| amount | numeric | not null, stored positive; sign applied via `direction` |
| created_by | text | |
| created_at | timestamptz | default now() |

### `founder_capital_entries`

| column | type | notes |
|---|---|---|
| id | bigint identity PK | |
| date | date | not null |
| description | text | |
| type | text | check in `('contribution','draw')` |
| amount | numeric | not null, stored positive |
| created_by | text | |
| created_at | timestamptz | default now() |

### `cash_projections`

| column | type | notes |
|---|---|---|
| id | bigint identity PK | |
| month | text | `YYYY-MM`, unique |
| projected_in | numeric | default 0 |
| projected_out | numeric | default 0 |
| notes | text | |
| created_by | text | |
| created_at | timestamptz | default now() |

No table is needed for Monthly Summary — it's a client-side aggregation of
`cash_ledger_entries` + `founder_capital_entries` grouped by
`date_trunc('month', date)`.

## Module structure

New directory `apps/hq/founder-finance/`, following the existing
`apps/hq/finance/` module pattern:

- `founderFinanceService.ts` — `fetchCashLedger()`, `addCashLedgerEntry()`,
  `updateCashLedgerEntry()`, `deleteCashLedgerEntry()`; same trio for
  `founder_capital_entries` and `cash_projections`.
- `founderFinance.ts` — `loadFounderFinance()` (fetches all three, populates
  new state slices), `renderFounderFinance()`, sub-tab switcher
  (`showFounderFinanceTab`), and per-section render functions:
  `renderCashLedger`, `renderFounderCapital`, `renderMonthlySummary`,
  `renderProjections`. Add/edit modals follow the existing bill/invoice
  modal pattern (open modal → fill form → save → re-render + toast).

State additions in `apps/hq/core/state.ts`: `_cashLedger`, `_founderCapital`,
`_cashProjections` arrays + setters, mirroring `_bills`/`_invoices`.

## UI — sub-tabs

Page `#page-founder-finance` with a sub-tab bar (same `.sub-tab` /
`.ftab`-style markup as the existing Finance page):

1. **Cash Ledger** — table sorted by date ascending, columns: Date,
   Description, Category, In, Out, Running Balance (computed client-side
   by walking the sorted rows). "Add Entry" button opens a modal
   (date, description, category select, direction toggle, amount). Row
   actions: edit, delete.
2. **Founder Capital** — table sorted by date ascending: Date, Description,
   Type (Contribution/Draw), Amount, Running Equity Balance. Same
   add/edit/delete modal pattern.
3. **Monthly Summary** — read-only table, one row per month (last 12 months
   with any activity): Cash In, Cash Out, Net Cash, Ending Cash Balance,
   Founder Contributions, Founder Draws, Ending Equity Balance. Purely
   derived — no separate data entry.
4. **Projections** — table of future months: Month, Projected In, Projected
   Out, Projected Net, Notes, plus a running "Projected Balance" column that
   starts from the current actual Cash Ledger ending balance and carries
   forward. "Add/Edit Month" modal (month picker, projected in/out, notes).

## Out of scope

- No integration with existing invoices/bills — this is a manually maintained
  ledger, intentionally independent of AR/AP.
- No automatic projection calculation (e.g. trailing-average forecasting) —
  projections are hand-entered per the approved design.
- No CSV/PDF export for this phase.
