import { describe, it, expect } from 'vitest';
import type {
  FinancialAccount, CashLedgerEntry, FounderCapitalEntry, Project, Budget,
} from '@shared/types.ts';
import {
  monthlySummary, profitAndLoss, cashFlowStatement, projectProfitability,
  revenueByCategory, expenseByCategory, filterEntries, availableYears,
  budgetVsActual, ALL_PERIODS,
} from './reportsCalc.ts';

const acct = (over: Partial<FinancialAccount> = {}): FinancialAccount => ({
  id: 1, name: 'Cash', type: 'cash', opening_balance: 0, is_active: true,
  is_default: false, notes: null, created_at: '', ...over,
});

let _id = 1;
const entry = (over: Partial<CashLedgerEntry> = {}): CashLedgerEntry => ({
  id: _id++, reference_no: null, txn_date: '2026-07-10', description: 'x',
  company: null, project_id: null, category: null, module_source: 'Manual', payment_method: null,
  account_id: 1, cash_in: 0, cash_out: 0, created_by: null, attachment_url: null,
  notes: null, source_type: null, source_id: null, created_at: '', ...over,
});

const founder = (over: Partial<FounderCapitalEntry> = {}): FounderCapitalEntry => ({
  id: _id++, reference_no: null, txn_date: '2026-07-10', founder: 'Miss Jenn',
  transaction_type: 'Capital Contribution', amount: 0, account_id: 1, ledger_id: null,
  notes: null, created_at: '', ...over,
});

describe('reportsCalc — monthlySummary', () => {
  it('computes revenue, expenses, and net profit from non-internal entries', () => {
    const entries = [
      entry({ category: 'Client Payment', cash_in: 10000 }),
      entry({ category: 'Sales', cash_in: 2000 }),
      entry({ category: 'Marketing', cash_out: 1500 }),
      entry({ category: 'Payroll', cash_out: 3000 }),
      entry({ category: 'Founder Capital', cash_in: 50000 }), // internal — excluded from P&L
    ];
    const s = monthlySummary(entries, [], ALL_PERIODS);
    expect(s.revenue).toBe(12000);
    expect(s.expenses).toBe(4500);
    expect(s.netProfit).toBe(7500);
    // Gross = revenue - cost of services (Payroll is a cost of service)
    expect(s.grossProfit).toBe(12000 - 3000);
  });

  it('includes internal entries in total cash flow but not in revenue', () => {
    const entries = [
      entry({ category: 'Client Payment', cash_in: 10000 }),
      entry({ category: 'Founder Capital', cash_in: 50000 }),
    ];
    const s = monthlySummary(entries, [], ALL_PERIODS);
    expect(s.totalCashIn).toBe(60000);
    expect(s.revenue).toBe(10000);
    expect(s.netCashFlow).toBe(60000);
  });

  it('rolls founder contributions and withdrawals into the period', () => {
    const f = [
      founder({ transaction_type: 'Capital Contribution', amount: 50000 }),
      founder({ transaction_type: 'Owner Withdrawal', amount: 8000 }),
    ];
    const s = monthlySummary([], f, ALL_PERIODS);
    expect(s.founderContributions).toBe(50000);
    expect(s.founderWithdrawals).toBe(8000);
  });

  it('is all zeros on empty data (fresh start)', () => {
    const s = monthlySummary([], [], ALL_PERIODS);
    expect(s.revenue).toBe(0);
    expect(s.netProfit).toBe(0);
    expect(s.netCashFlow).toBe(0);
  });
});

describe('reportsCalc — period filtering', () => {
  const entries = [
    entry({ txn_date: '2026-06-15', category: 'Sales', cash_in: 100 }),
    entry({ txn_date: '2026-07-15', category: 'Sales', cash_in: 200 }),
    entry({ txn_date: '2025-07-15', category: 'Sales', cash_in: 400 }),
  ];

  it('filters by year', () => {
    const rows = filterEntries(entries, { year: 2026, month: null, projectId: null });
    expect(rows).toHaveLength(2);
  });

  it('filters by year + month', () => {
    const rows = filterEntries(entries, { year: 2026, month: 7, projectId: null });
    expect(rows).toHaveLength(1);
    expect(rows[0].cash_in).toBe(200);
  });

  it('lists available years descending, including current year', () => {
    const years = availableYears(entries);
    expect(years).toContain(2026);
    expect(years).toContain(2025);
    expect(years[0]).toBeGreaterThanOrEqual(years[years.length - 1]);
  });
});

describe('reportsCalc — profitAndLoss', () => {
  it('splits cost of services from operating expenses', () => {
    const entries = [
      entry({ category: 'Client Payment', cash_in: 20000 }),
      entry({ category: 'Payroll', cash_out: 5000 }),      // cost of services
      entry({ category: 'Operations', cash_out: 2000 }),   // cost of services
      entry({ category: 'Marketing', cash_out: 1000 }),    // operating
      entry({ category: 'Software', cash_out: 500 }),      // operating
    ];
    const pl = profitAndLoss(entries, ALL_PERIODS);
    expect(pl.totalRevenue).toBe(20000);
    expect(pl.totalCostOfServices).toBe(7000);
    expect(pl.grossIncome).toBe(13000);
    expect(pl.totalOperatingExpenses).toBe(1500);
    expect(pl.netProfit).toBe(11500);
  });
});

describe('reportsCalc — cashFlowStatement', () => {
  it('separates operating from financing cash flows', () => {
    const entries = [
      entry({ category: 'Client Payment', cash_in: 10000 }),
      entry({ category: 'Marketing', cash_out: 2000 }),
      entry({ category: 'Founder Capital', cash_in: 50000 }),
      entry({ category: 'Founder Withdrawal', cash_out: 5000 }),
    ];
    const cf = cashFlowStatement(entries, [acct({ opening_balance: 0 })], ALL_PERIODS);
    expect(cf.operatingNet).toBe(8000);
    expect(cf.financingIn).toBe(50000);
    expect(cf.financingOut).toBe(5000);
    expect(cf.financingNet).toBe(45000);
    expect(cf.netChange).toBe(53000);
    expect(cf.endingCash).toBe(53000);
  });
});

describe('reportsCalc — projectProfitability', () => {
  const projects: Project[] = [
    { id: 10, name: 'Alpha', code: null, proposal_id: null, client: null, brand: null, category: null, value: 0, status: 'active', notes: null, created_at: '', updated_at: '' },
  ];
  it('groups revenue and expenses per project, unassigned last', () => {
    const entries = [
      entry({ project_id: 10, category: 'Client Payment', cash_in: 8000 }),
      entry({ project_id: 10, category: 'Marketing', cash_out: 1000 }),
      entry({ project_id: null, category: 'Sales', cash_in: 500 }),
    ];
    const rows = projectProfitability(entries, projects, ALL_PERIODS);
    const alpha = rows.find(r => r.projectId === 10)!;
    expect(alpha.revenue).toBe(8000);
    expect(alpha.expenses).toBe(1000);
    expect(alpha.net).toBe(7000);
    expect(alpha.code).toBe('P-10');
    expect(rows.find(r => r.projectId === null)!.name).toBe('Unassigned');
  });
});

describe('reportsCalc — budgetVsActual', () => {
  const budgets: Budget[] = [
    { id: 1, category: 'Marketing', period_year: 2026, period_month: null, amount: 10000, notes: null, created_at: '' },
    { id: 2, category: 'Software', period_year: 2026, period_month: null, amount: 5000, notes: null, created_at: '' },
  ];
  it('compares budget to actual spend and flags over/under', () => {
    const entries = [
      entry({ txn_date: '2026-03-01', category: 'Marketing', cash_out: 12000 }),
      entry({ txn_date: '2026-03-01', category: 'Software', cash_out: 2000 }),
    ];
    const rows = budgetVsActual(budgets, entries, 2026, null);
    const mkt = rows.find(r => r.category === 'Marketing')!;
    expect(mkt.budget).toBe(10000);
    expect(mkt.actual).toBe(12000);
    expect(mkt.variance).toBe(-2000);   // over budget
    expect(mkt.usedPct).toBeCloseTo(120);
    const sw = rows.find(r => r.category === 'Software')!;
    expect(sw.variance).toBe(3000);     // under budget
  });

  it('includes unbudgeted categories that have actual spend', () => {
    const entries = [entry({ txn_date: '2026-03-01', category: 'Travel', cash_out: 800 })];
    const rows = budgetVsActual(budgets, entries, 2026, null);
    const travel = rows.find(r => r.category === 'Travel')!;
    expect(travel.budget).toBe(0);
    expect(travel.actual).toBe(800);
    expect(travel.usedPct).toBeNull();
  });

  it('respects the month filter', () => {
    const monthlyBudget: Budget[] = [{ id: 3, category: 'Office', period_year: 2026, period_month: 3, amount: 1000, notes: null, created_at: '' }];
    const entries = [
      entry({ txn_date: '2026-03-10', category: 'Office', cash_out: 400 }),
      entry({ txn_date: '2026-04-10', category: 'Office', cash_out: 900 }),
    ];
    const rows = budgetVsActual(monthlyBudget, entries, 2026, 3);
    expect(rows.find(r => r.category === 'Office')!.actual).toBe(400);
  });
});

describe('reportsCalc — category rollups', () => {
  it('groups and sorts by amount descending', () => {
    const entries = [
      entry({ category: 'Marketing', cash_out: 1000 }),
      entry({ category: 'Payroll', cash_out: 5000 }),
      entry({ category: 'Marketing', cash_out: 500 }),
    ];
    const exp = expenseByCategory(entries);
    expect(exp[0]).toEqual({ category: 'Payroll', amount: 5000 });
    expect(exp[1]).toEqual({ category: 'Marketing', amount: 1500 });
  });

  it('revenueByCategory keeps only income-side cash-in', () => {
    const entries = [
      entry({ category: 'Client Payment', cash_in: 3000 }),
      entry({ category: 'Marketing', cash_out: 1000 }),
    ];
    const rev = revenueByCategory(entries);
    expect(rev).toEqual([{ category: 'Client Payment', amount: 3000 }]);
  });

  // Carried over from the 2026 spreadsheet: 'Team Fee' is used both for a fee
  // the team earned and a fee the team was paid. Which side of the ledger the
  // amount sits on is what decides, not the category name.
  it('counts Team Fee as revenue when it comes in and expense when it goes out', () => {
    const entries = [
      entry({ category: 'Team Fee', cash_in: 5000 }),
      entry({ category: 'Team Fee', cash_out: 1000 }),
    ];
    expect(revenueByCategory(entries)).toEqual([{ category: 'Team Fee', amount: 5000 }]);
    expect(expenseByCategory(entries)).toEqual([{ category: 'Team Fee', amount: 1000 }]);
  });

  it('treats the other spreadsheet categories as one-directional', () => {
    const entries = [
      entry({ category: 'Affiliate Sales', cash_in: 916 }),
      entry({ category: 'Team Expenses', cash_out: 400 }),
      entry({ category: 'Founder Expenses', cash_out: 500 }),
      entry({ category: 'Affiliate Fee', cash_out: 500 }),
    ];
    expect(revenueByCategory(entries)).toEqual([{ category: 'Affiliate Sales', amount: 916 }]);
    expect(expenseByCategory(entries).map(e => e.category).sort())
      .toEqual(['Affiliate Fee', 'Founder Expenses', 'Team Expenses']);
  });
});
