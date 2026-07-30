// Pure, DOM-free finance math for the Cash Ledger, Founder Capital and
// Projections tabs. No Supabase, no window — unit-tested in ledgerCalc.test.ts.
// Running balances are COMPUTED here (never stored), consistent with how the
// rest of Finance derives figures on the fly.
import type {
  FinancialAccount, CashLedgerEntry, FounderCapitalEntry, AccountType,
} from '@shared/types.ts';

// Categories that move cash but are not operating revenue/expense.
export const INTERNAL_CATEGORIES = [
  'Founder Capital', 'Founder Withdrawal', 'Transfer', 'Adjustment',
];

function isInternal(category: string | null | undefined): boolean {
  return INTERNAL_CATEGORIES.includes(category ?? '');
}

function monthKey(date: string | null | undefined): string {
  return (date ?? '').slice(0, 7); // YYYY-MM
}

// Oldest → newest, tie-broken by id, without mutating the input.
export function sortLedgerAsc(entries: CashLedgerEntry[]): CashLedgerEntry[] {
  return [...entries].sort((a, b) => {
    const da = a.txn_date ?? '';
    const db = b.txn_date ?? '';
    if (da !== db) return da < db ? -1 : 1;
    return a.id - b.id;
  });
}

// Map of entry id → running balance of that entry's account after the entry.
// Entries with no account get NaN (balance is undefined without an account).
export function runningBalanceMap(
  entries: CashLedgerEntry[],
  accounts: FinancialAccount[],
): Map<number, number> {
  const balance = new Map<number, number>(
    accounts.map(a => [a.id, a.opening_balance || 0]),
  );
  const result = new Map<number, number>();
  for (const e of sortLedgerAsc(entries)) {
    if (e.account_id == null) { result.set(e.id, NaN); continue; }
    const prev = balance.get(e.account_id) ?? 0;
    const next = prev + (e.cash_in || 0) - (e.cash_out || 0);
    balance.set(e.account_id, next);
    result.set(e.id, next);
  }
  return result;
}

// Current balance of a single account (opening + net movement).
export function accountBalance(
  accountId: number,
  entries: CashLedgerEntry[],
  accounts: FinancialAccount[],
): number {
  const opening = accounts.find(a => a.id === accountId)?.opening_balance || 0;
  const net = entries
    .filter(e => e.account_id === accountId)
    .reduce((s, e) => s + (e.cash_in || 0) - (e.cash_out || 0), 0);
  return opening + net;
}

export interface CashPosition {
  total: number;
  byType: Record<AccountType, number>;
}

// Total cash on hand plus a per-type (cash / bank / ewallet) breakdown.
export function cashPosition(
  entries: CashLedgerEntry[],
  accounts: FinancialAccount[],
): CashPosition {
  const byType: Record<AccountType, number> = { cash: 0, bank: 0, ewallet: 0 };
  let total = 0;
  for (const acc of accounts) {
    if (!acc.is_active) continue;
    const bal = accountBalance(acc.id, entries, accounts);
    byType[acc.type] = (byType[acc.type] || 0) + bal;
    total += bal;
  }
  return { total, byType };
}

export interface FounderEquity {
  totalCapital: number;
  totalWithdrawals: number;
  netEquity: number;
}

export function founderEquity(founderEntries: FounderCapitalEntry[]): FounderEquity {
  const totalCapital = founderEntries
    .filter(f => f.transaction_type === 'Capital Contribution')
    .reduce((s, f) => s + (f.amount || 0), 0);
  const totalWithdrawals = founderEntries
    .filter(f => f.transaction_type === 'Owner Withdrawal')
    .reduce((s, f) => s + (f.amount || 0), 0);
  return { totalCapital, totalWithdrawals, netEquity: totalCapital - totalWithdrawals };
}

// ── Projections ───────────────────────────────────────────────────────────────

export interface ProjectionPeriod {
  label: string;
  months: number;
  projectedRevenue: number;
  projectedExpenses: number;
  projectedCash: number;
}

export interface ProjectionMetrics {
  currentCash: number;
  avgMonthlyRevenue: number;
  avgMonthlyExpenses: number;
  avgNetProfit: number;
  monthlyBurnRate: number;
  cashRunwayMonths: number | null;   // null = not burning (infinite runway)
  revenueGrowthPct: number | null;   // null = not enough history
  expenseGrowthPct: number | null;
  monthsObserved: number;
  periods: ProjectionPeriod[];
}

const FORECAST_PERIODS: ReadonlyArray<{ label: string; months: number }> = [
  { label: 'Next Month',    months: 1 },
  { label: 'Next Quarter',  months: 3 },
  { label: 'Next 6 Months', months: 6 },
  { label: 'Next Year',     months: 12 },
];

// Revenue = non-internal cash-in; Expenses = non-internal cash-out.
function monthlyTotals(entries: CashLedgerEntry[]): Map<string, { rev: number; exp: number }> {
  const byMonth = new Map<string, { rev: number; exp: number }>();
  for (const e of entries) {
    if (isInternal(e.category)) continue;
    const key = monthKey(e.txn_date);
    if (!key) continue;
    const cur = byMonth.get(key) ?? { rev: 0, exp: 0 };
    byMonth.set(key, { rev: cur.rev + (e.cash_in || 0), exp: cur.exp + (e.cash_out || 0) });
  }
  return byMonth;
}

function growthPct(prev: number, last: number): number | null {
  if (prev <= 0) return null;
  return ((last - prev) / prev) * 100;
}

export function projectionMetrics(
  entries: CashLedgerEntry[],
  accounts: FinancialAccount[],
): ProjectionMetrics {
  const currentCash = cashPosition(entries, accounts).total;
  const byMonth = monthlyTotals(entries);
  const months = [...byMonth.keys()].sort();
  const monthsObserved = months.length;

  const sumRev = months.reduce((s, m) => s + byMonth.get(m)!.rev, 0);
  const sumExp = months.reduce((s, m) => s + byMonth.get(m)!.exp, 0);
  const divisor = monthsObserved || 1;
  const avgMonthlyRevenue = sumRev / divisor;
  const avgMonthlyExpenses = sumExp / divisor;
  const avgNetProfit = avgMonthlyRevenue - avgMonthlyExpenses;
  const monthlyBurnRate = Math.max(avgMonthlyExpenses - avgMonthlyRevenue, 0);
  const cashRunwayMonths = monthlyBurnRate > 0 ? currentCash / monthlyBurnRate : null;

  let revenueGrowthPct: number | null = null;
  let expenseGrowthPct: number | null = null;
  if (monthsObserved >= 2) {
    const prev = byMonth.get(months[monthsObserved - 2])!;
    const last = byMonth.get(months[monthsObserved - 1])!;
    revenueGrowthPct = growthPct(prev.rev, last.rev);
    expenseGrowthPct = growthPct(prev.exp, last.exp);
  }

  const periods: ProjectionPeriod[] = FORECAST_PERIODS.map(p => ({
    label: p.label,
    months: p.months,
    projectedRevenue: avgMonthlyRevenue * p.months,
    projectedExpenses: avgMonthlyExpenses * p.months,
    projectedCash: currentCash + avgNetProfit * p.months,
  }));

  return {
    currentCash,
    avgMonthlyRevenue,
    avgMonthlyExpenses,
    avgNetProfit,
    monthlyBurnRate,
    cashRunwayMonths,
    revenueGrowthPct,
    expenseGrowthPct,
    monthsObserved,
    periods,
  };
}
