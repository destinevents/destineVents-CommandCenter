// Pure, DOM-free derivations for Monthly Summary (§5), the Finance Dashboard
// (§2) and the Reports engine (§7). Everything is computed from the Cash Ledger
// + Founder Capital — no manual encoding, consistent with the handout's
// "auto-calculated, read only" mandate. No Supabase, no window; unit-tested in
// reportsCalc.test.ts.
import type {
  FinancialAccount, CashLedgerEntry, FounderCapitalEntry, Project, Budget,
} from '@shared/types.ts';
import { INTERNAL_CATEGORIES, cashPosition } from './ledgerCalc.ts';

// Cash-basis P&L split. "Cost of services" are the direct costs of delivering
// client work; everything else non-internal that leaves cash is an operating
// expense. Gross Income = Revenue - Cost of Services; Net Profit = Gross Income
// - Operating Expenses = Revenue - all expenses.
export const COST_OF_SERVICES_CATEGORIES: ReadonlyArray<string> = [
  'Payroll', 'Operations', 'Equipment', 'Team Fee', 'Team Expenses', 'Affiliate Fee',
];

export const INCOME_CATEGORIES: ReadonlyArray<string> = [
  'Client Payment', 'Team Fee', 'Affiliate Sales',
  'Sales', 'Grant', 'Donation', 'Investment', 'Other Income',
];

// 'Team Fee' appears in both lists on purpose: the same category is used for a
// fee earned (Cash In) and a fee paid to the team (Cash Out). isExpenseOnly
// below is what keeps a dual-direction category counting as revenue when the
// money came in.
export const EXPENSE_CATEGORIES: ReadonlyArray<string> = [
  'Team Expenses', 'Team Fee', 'Affiliate Fee', 'Founder Expenses',
  'Payroll', 'Marketing', 'Software', 'Utilities', 'Office', 'Travel',
  'Equipment', 'Operations', 'Taxes', 'Miscellaneous',
];

function isInternal(category: string | null | undefined): boolean {
  return INTERNAL_CATEGORIES.includes(category ?? '');
}

function isCostOfServices(category: string | null | undefined): boolean {
  return COST_OF_SERVICES_CATEGORIES.includes(category ?? '');
}

// ── Period filtering ───────────────────────────────────────────────────────────

export interface PeriodFilter {
  year: number | null;    // null = all years
  month: number | null;   // 1-12, or null = whole year / all
  projectId: number | null;
}

export const ALL_PERIODS: PeriodFilter = { year: null, month: null, projectId: null };

function inPeriod(entry: CashLedgerEntry, f: PeriodFilter): boolean {
  const key = (entry.txn_date ?? '').slice(0, 10);
  if (!key) return false;
  if (f.year != null) {
    const y = Number(key.slice(0, 4));
    if (y !== f.year) return false;
    if (f.month != null) {
      const m = Number(key.slice(5, 7));
      if (m !== f.month) return false;
    }
  }
  if (f.projectId != null && entry.project_id !== f.projectId) return false;
  return true;
}

export function filterEntries(entries: CashLedgerEntry[], f: PeriodFilter): CashLedgerEntry[] {
  return entries.filter(e => inPeriod(e, f));
}

// ── Category rollups ────────────────────────────────────────────────────────────

export interface CategoryTotal {
  category: string;
  amount: number;
}

// Non-internal cash-in grouped by category, highest first.
export function revenueByCategory(entries: CashLedgerEntry[]): CategoryTotal[] {
  return rollup(entries, 'in', c => !isInternal(c) && !isExpenseOnly(c));
}

// Non-internal cash-out grouped by category, highest first.
export function expenseByCategory(entries: CashLedgerEntry[]): CategoryTotal[] {
  return rollup(entries, 'out', c => !isInternal(c));
}

function isExpenseOnly(category: string | null | undefined): boolean {
  const c = category ?? '';
  return EXPENSE_CATEGORIES.includes(c) && !INCOME_CATEGORIES.includes(c);
}

function rollup(
  entries: CashLedgerEntry[],
  side: 'in' | 'out',
  keep: (c: string | null | undefined) => boolean,
): CategoryTotal[] {
  const map = new Map<string, number>();
  for (const e of entries) {
    if (!keep(e.category)) continue;
    const amt = side === 'in' ? (e.cash_in || 0) : (e.cash_out || 0);
    if (amt <= 0) continue;
    const cat = e.category || 'Uncategorized';
    map.set(cat, (map.get(cat) || 0) + amt);
  }
  return [...map.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

// ── Monthly Summary (§5) ────────────────────────────────────────────────────────

export interface MonthlySummary {
  revenue: number;
  expenses: number;
  grossProfit: number;
  netProfit: number;
  totalCashIn: number;
  totalCashOut: number;
  netCashFlow: number;
  collections: number;
  payments: number;
  founderContributions: number;
  founderWithdrawals: number;
}

export function monthlySummary(
  entries: CashLedgerEntry[],
  founder: FounderCapitalEntry[],
  f: PeriodFilter,
): MonthlySummary {
  const rows = filterEntries(entries, f);
  const operating = rows.filter(e => !isInternal(e.category));

  const revenue = operating.reduce((s, e) => s + (e.cash_in || 0), 0);
  const expenses = operating.reduce((s, e) => s + (e.cash_out || 0), 0);
  const costOfServices = operating
    .filter(e => isCostOfServices(e.category))
    .reduce((s, e) => s + (e.cash_out || 0), 0);
  const grossProfit = revenue - costOfServices;
  const netProfit = revenue - expenses;

  const totalCashIn = rows.reduce((s, e) => s + (e.cash_in || 0), 0);
  const totalCashOut = rows.reduce((s, e) => s + (e.cash_out || 0), 0);

  const collections = operating
    .filter(e => e.category === 'Client Payment' || e.module_source === 'AR')
    .reduce((s, e) => s + (e.cash_in || 0), 0);
  const payments = operating
    .filter(e => e.module_source === 'AP' || e.module_source === 'Payroll' || e.category === 'Payroll')
    .reduce((s, e) => s + (e.cash_out || 0), 0);

  const founderInPeriod = founder.filter(fc => {
    const key = (fc.txn_date ?? '').slice(0, 10);
    if (!key) return false;
    if (f.year != null && Number(key.slice(0, 4)) !== f.year) return false;
    if (f.year != null && f.month != null && Number(key.slice(5, 7)) !== f.month) return false;
    return true;
  });
  const founderContributions = founderInPeriod
    .filter(fc => fc.transaction_type === 'Capital Contribution')
    .reduce((s, fc) => s + (fc.amount || 0), 0);
  const founderWithdrawals = founderInPeriod
    .filter(fc => fc.transaction_type === 'Owner Withdrawal')
    .reduce((s, fc) => s + (fc.amount || 0), 0);

  return {
    revenue, expenses, grossProfit, netProfit,
    totalCashIn, totalCashOut, netCashFlow: totalCashIn - totalCashOut,
    collections, payments, founderContributions, founderWithdrawals,
  };
}

// ── Profit & Loss (§7) ──────────────────────────────────────────────────────────

export interface ProfitLoss {
  revenue: CategoryTotal[];
  totalRevenue: number;
  costOfServices: CategoryTotal[];
  totalCostOfServices: number;
  grossIncome: number;
  operatingExpenses: CategoryTotal[];
  totalOperatingExpenses: number;
  netProfit: number;
}

export function profitAndLoss(entries: CashLedgerEntry[], f: PeriodFilter): ProfitLoss {
  const rows = filterEntries(entries, f).filter(e => !isInternal(e.category));
  const revenue = revenueByCategory(rows);
  const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0);

  const allExpenses = expenseByCategory(rows);
  const costOfServices = allExpenses.filter(c => isCostOfServices(c.category));
  const operatingExpenses = allExpenses.filter(c => !isCostOfServices(c.category));
  const totalCostOfServices = costOfServices.reduce((s, c) => s + c.amount, 0);
  const totalOperatingExpenses = operatingExpenses.reduce((s, c) => s + c.amount, 0);
  const grossIncome = totalRevenue - totalCostOfServices;

  return {
    revenue, totalRevenue,
    costOfServices, totalCostOfServices,
    grossIncome,
    operatingExpenses, totalOperatingExpenses,
    netProfit: totalRevenue - totalCostOfServices - totalOperatingExpenses,
  };
}

// ── Cash Flow Statement (§7) ──────────────────────────────────────────────────────

export interface CashFlowStatement {
  operatingIn: number;
  operatingOut: number;
  operatingNet: number;
  financingIn: number;   // founder capital in, transfers in
  financingOut: number;  // founder withdrawals out
  financingNet: number;
  netChange: number;
  endingCash: number;
}

export function cashFlowStatement(
  entries: CashLedgerEntry[],
  accounts: FinancialAccount[],
  f: PeriodFilter,
): CashFlowStatement {
  const rows = filterEntries(entries, f);
  const operating = rows.filter(e => !isInternal(e.category));
  const financing = rows.filter(e => isInternal(e.category));

  const operatingIn = operating.reduce((s, e) => s + (e.cash_in || 0), 0);
  const operatingOut = operating.reduce((s, e) => s + (e.cash_out || 0), 0);
  const financingIn = financing.reduce((s, e) => s + (e.cash_in || 0), 0);
  const financingOut = financing.reduce((s, e) => s + (e.cash_out || 0), 0);

  return {
    operatingIn, operatingOut, operatingNet: operatingIn - operatingOut,
    financingIn, financingOut, financingNet: financingIn - financingOut,
    netChange: (operatingIn + financingIn) - (operatingOut + financingOut),
    endingCash: cashPosition(entries, accounts).total,
  };
}

// ── Project Profitability (§7) ────────────────────────────────────────────────────

export interface ProjectProfit {
  projectId: number | null;
  name: string;
  code: string;
  revenue: number;
  expenses: number;
  net: number;
}

export function projectProfitability(
  entries: CashLedgerEntry[],
  projects: Project[],
  f: PeriodFilter,
): ProjectProfit[] {
  const rows = filterEntries(entries, { ...f, projectId: null })
    .filter(e => !isInternal(e.category));
  const byProject = new Map<number | null, { revenue: number; expenses: number }>();
  for (const e of rows) {
    const key = e.project_id ?? null;
    const cur = byProject.get(key) ?? { revenue: 0, expenses: 0 };
    byProject.set(key, {
      revenue: cur.revenue + (e.cash_in || 0),
      expenses: cur.expenses + (e.cash_out || 0),
    });
  }
  return [...byProject.entries()]
    .map(([projectId, v]) => {
      const proj = projectId != null ? projects.find(p => p.id === projectId) : null;
      return {
        projectId,
        name: proj?.name ?? 'Unassigned',
        // Use the project's real code; fall back for legacy projects without one.
        code: proj ? (proj.code || `P-${proj.id}`) : '',
        revenue: v.revenue,
        expenses: v.expenses,
        net: v.revenue - v.expenses,
      };
    })
    .sort((a, b) => b.net - a.net);
}

// ── Budget vs Actual (§1) ─────────────────────────────────────────────────────────

export interface BudgetLine {
  category: string;
  budget: number;
  actual: number;
  variance: number;      // budget - actual (positive = under budget)
  usedPct: number | null; // actual / budget * 100, null when no budget set
}

// Compare each budgeted category against actual spend from the Cash Ledger for
// the given year (and optional month). Categories with actual spend but no
// budget are included with budget 0.
export function budgetVsActual(
  budgets: Budget[],
  entries: CashLedgerEntry[],
  year: number,
  month: number | null,
): BudgetLine[] {
  const inPeriodBudget = budgets.filter(b =>
    b.period_year === year && (month == null ? b.period_month == null : b.period_month === month));
  const budgetByCat = new Map<string, number>();
  for (const b of inPeriodBudget) {
    budgetByCat.set(b.category, (budgetByCat.get(b.category) || 0) + (b.amount || 0));
  }

  const actuals = expenseByCategory(filterEntries(entries, { year, month, projectId: null }));
  const actualByCat = new Map(actuals.map(a => [a.category, a.amount]));

  const categories = new Set<string>([...budgetByCat.keys(), ...actualByCat.keys()]);
  return [...categories]
    .map(category => {
      const budget = budgetByCat.get(category) || 0;
      const actual = actualByCat.get(category) || 0;
      return {
        category,
        budget,
        actual,
        variance: budget - actual,
        usedPct: budget > 0 ? (actual / budget) * 100 : null,
      };
    })
    .sort((a, b) => b.budget - a.budget || b.actual - a.actual);
}

// ── Available years present in the data (for the year filter) ──────────────────────

export function availableYears(entries: CashLedgerEntry[]): number[] {
  const years = new Set<number>();
  for (const e of entries) {
    const y = Number((e.txn_date ?? '').slice(0, 4));
    if (y) years.add(y);
  }
  years.add(new Date().getFullYear());
  return [...years].sort((a, b) => b - a);
}
