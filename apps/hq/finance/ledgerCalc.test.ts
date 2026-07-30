import { describe, it, expect } from 'vitest';
import type { FinancialAccount, CashLedgerEntry, FounderCapitalEntry } from '@shared/types.ts';
import {
  runningBalanceMap, accountBalance, cashPosition, founderEquity,
  projectionMetrics, sortLedgerAsc,
} from './ledgerCalc.ts';

const acct = (id: number, type: string, opening = 0): FinancialAccount =>
  ({ id, type, opening_balance: opening, is_active: true, name: `A${id}` } as unknown as FinancialAccount);

const entry = (
  id: number, account_id: number | null, cash_in: number, cash_out: number,
  txn_date: string, category = 'Client Payment',
): CashLedgerEntry =>
  ({ id, account_id, cash_in, cash_out, txn_date, category, description: 'x', module_source: 'Manual' } as unknown as CashLedgerEntry);

const founder = (type: string, amount: number): FounderCapitalEntry =>
  ({ transaction_type: type, amount } as unknown as FounderCapitalEntry);

describe('sortLedgerAsc', () => {
  it('sorts oldest first, tie-broken by id, without mutating input', () => {
    const input = [entry(2, 1, 0, 0, '2026-08-02'), entry(1, 1, 0, 0, '2026-08-01'), entry(3, 1, 0, 0, '2026-08-02')];
    const out = sortLedgerAsc(input);
    expect(out.map(e => e.id)).toEqual([1, 2, 3]);
    expect(input.map(e => e.id)).toEqual([2, 1, 3]); // original untouched
  });
});

describe('runningBalanceMap', () => {
  it('carries a per-account running balance from the opening balance', () => {
    const accounts = [acct(1, 'bank', 1000)];
    const entries = [
      entry(10, 1, 500, 0, '2026-08-01'),   // 1500
      entry(11, 1, 0, 200, '2026-08-02'),   // 1300
      entry(12, 1, 0, 300, '2026-08-03'),   // 1000
    ];
    const map = runningBalanceMap(entries, accounts);
    expect(map.get(10)).toBe(1500);
    expect(map.get(11)).toBe(1300);
    expect(map.get(12)).toBe(1000);
  });

  it('keeps balances independent across accounts', () => {
    const accounts = [acct(1, 'bank', 0), acct(2, 'cash', 100)];
    const entries = [entry(10, 1, 500, 0, '2026-08-01'), entry(11, 2, 0, 50, '2026-08-01')];
    const map = runningBalanceMap(entries, accounts);
    expect(map.get(10)).toBe(500);
    expect(map.get(11)).toBe(50);
  });

  it('marks entries with no account as NaN', () => {
    const map = runningBalanceMap([entry(10, null, 500, 0, '2026-08-01')], []);
    expect(Number.isNaN(map.get(10))).toBe(true);
  });
});

describe('accountBalance', () => {
  it('is opening balance plus net movement', () => {
    const accounts = [acct(1, 'bank', 1000)];
    const entries = [entry(10, 1, 500, 0, '2026-08-01'), entry(11, 1, 0, 300, '2026-08-02')];
    expect(accountBalance(1, entries, accounts)).toBe(1200);
  });
});

describe('cashPosition', () => {
  it('totals active accounts and breaks down by type', () => {
    const accounts = [acct(1, 'bank', 1000), acct(2, 'cash', 200), acct(3, 'ewallet', 50)];
    const entries = [entry(10, 1, 500, 0, '2026-08-01'), entry(11, 2, 0, 100, '2026-08-01')];
    const pos = cashPosition(entries, accounts);
    expect(pos.byType.bank).toBe(1500);
    expect(pos.byType.cash).toBe(100);
    expect(pos.byType.ewallet).toBe(50);
    expect(pos.total).toBe(1650);
  });

  it('excludes inactive accounts', () => {
    const inactive = { ...acct(2, 'cash', 999), is_active: false };
    const pos = cashPosition([], [acct(1, 'bank', 100), inactive]);
    expect(pos.total).toBe(100);
  });
});

describe('founderEquity', () => {
  it('nets contributions against withdrawals', () => {
    const eq = founderEquity([
      founder('Capital Contribution', 10000),
      founder('Capital Contribution', 5000),
      founder('Owner Withdrawal', 3000),
    ]);
    expect(eq.totalCapital).toBe(15000);
    expect(eq.totalWithdrawals).toBe(3000);
    expect(eq.netEquity).toBe(12000);
  });

  it('is all zero for no entries', () => {
    expect(founderEquity([])).toEqual({ totalCapital: 0, totalWithdrawals: 0, netEquity: 0 });
  });
});

describe('projectionMetrics', () => {
  it('returns safe zeros for empty data (no NaN/Infinity)', () => {
    const m = projectionMetrics([], []);
    expect(m.currentCash).toBe(0);
    expect(m.avgMonthlyRevenue).toBe(0);
    expect(m.monthlyBurnRate).toBe(0);
    expect(m.cashRunwayMonths).toBeNull();
    expect(m.revenueGrowthPct).toBeNull();
    expect(m.monthsObserved).toBe(0);
    expect(m.periods).toHaveLength(4);
  });

  it('averages revenue and expenses over observed months', () => {
    const accounts = [acct(1, 'bank', 0)];
    const entries = [
      entry(1, 1, 1000, 0, '2026-07-05'),
      entry(2, 1, 0, 400, '2026-07-10'),
      entry(3, 1, 2000, 0, '2026-08-05'),
      entry(4, 1, 0, 600, '2026-08-10'),
    ];
    const m = projectionMetrics(entries, accounts);
    expect(m.monthsObserved).toBe(2);
    expect(m.avgMonthlyRevenue).toBe(1500); // (1000+2000)/2
    expect(m.avgMonthlyExpenses).toBe(500); // (400+600)/2
    expect(m.avgNetProfit).toBe(1000);
  });

  it('computes burn rate and finite runway when spending exceeds income', () => {
    const accounts = [acct(1, 'bank', 3000)];
    const entries = [
      entry(1, 1, 100, 0, '2026-08-05'),
      entry(2, 1, 0, 1100, '2026-08-10'),
    ];
    const m = projectionMetrics(entries, accounts);
    // current cash = 3000 + 100 - 1100 = 2000; burn = 1000/month; runway = 2 months
    expect(m.currentCash).toBe(2000);
    expect(m.monthlyBurnRate).toBe(1000);
    expect(m.cashRunwayMonths).toBe(2);
  });

  it('excludes internal (founder/transfer) categories from revenue and expenses', () => {
    const accounts = [acct(1, 'bank', 0)];
    const entries = [
      entry(1, 1, 5000, 0, '2026-08-05', 'Founder Capital'),
      entry(2, 1, 1000, 0, '2026-08-06', 'Client Payment'),
    ];
    const m = projectionMetrics(entries, accounts);
    expect(m.avgMonthlyRevenue).toBe(1000); // founder capital excluded
    expect(m.currentCash).toBe(6000);       // but still counts as cash
  });

  it('derives month-over-month growth, null when prior month is zero', () => {
    const accounts = [acct(1, 'bank', 0)];
    const entries = [
      entry(1, 1, 1000, 0, '2026-07-05'),
      entry(2, 1, 1500, 0, '2026-08-05'),
    ];
    const m = projectionMetrics(entries, accounts);
    expect(m.revenueGrowthPct).toBe(50);   // 1000 -> 1500
    expect(m.expenseGrowthPct).toBeNull(); // no expenses either month
  });

  it('projects forward periods from averages', () => {
    const accounts = [acct(1, 'bank', 0)];
    const entries = [entry(1, 1, 1000, 400, '2026-08-05')];
    const m = projectionMetrics(entries, accounts);
    const quarter = m.periods.find(p => p.months === 3)!;
    expect(quarter.projectedRevenue).toBe(3000);
    expect(quarter.projectedExpenses).toBe(1200);
    expect(quarter.projectedCash).toBe(600 + 600 * 3); // currentCash 600 + netProfit 600 * 3
  });
});
