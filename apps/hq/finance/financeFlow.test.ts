// End-to-end test of the money chain, at the level of logic rather than UI.
//
// The QA brief (Section S) asks for one clean run from a won proposal through
// to the reports, checking that figures carry correctly, nothing double-posts,
// reversals actually reverse, and the reports reconcile with the ledger. A
// browser is needed to prove the screens do their part; this proves the layer
// underneath them, and unlike a manual run it re-checks itself on every commit.
//
// The data layer is an in-memory store, so the real syncSourceLedger,
// reverseSourceFromLedger, ledgerCalc and reportsCalc all run for real.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FinancialAccount, CashLedgerEntry } from '@shared/types.ts';

// ── In-memory stand-in for ledgerService ──────────────────────────────────────
let _rows: CashLedgerEntry[] = [];
let _nextId = 1;

vi.mock('./ledgerService.ts', () => ({
  createLedgerEntry: vi.fn(async (payload: Partial<CashLedgerEntry>) => {
    const row = { id: _nextId++, ...payload } as CashLedgerEntry;
    _rows.push(row);
    return row;
  }),
  updateLedgerEntry: vi.fn(async (id: number, changes: Partial<CashLedgerEntry>) => {
    const i = _rows.findIndex(r => r.id === id);
    if (i === -1) return false;
    // Immutable: replace the row rather than mutating it in place.
    _rows = _rows.map(r => (r.id === id ? { ...r, ...changes } : r));
    return true;
  }),
  deleteLedgerEntry: vi.fn(async (id: number) => {
    const before = _rows.length;
    _rows = _rows.filter(r => r.id !== id);
    return _rows.length < before;
  }),
  findLedgerBySource: vi.fn(async (sourceType: string, sourceId: number) =>
    _rows.filter(r => r.source_type === sourceType && r.source_id === sourceId)),
}));

const { syncSourceLedger, reverseSourceFromLedger } = await import('./ledgerPosting.ts');
const { cashPosition, accountBalance, runningBalanceMap } = await import('./ledgerCalc.ts');
const { monthlySummary, profitAndLoss, ALL_PERIODS } = await import('./reportsCalc.ts');

// ── The books, as Finance -> Settings would have them ─────────────────────────
const acct = (over: Partial<FinancialAccount>): FinancialAccount => ({
  id: 1, name: 'A', type: 'bank', opening_balance: 0, is_active: true,
  is_default: false, notes: null, created_at: '', ...over,
});

const accounts: FinancialAccount[] = [
  acct({ id: 1, name: 'Cash on Hand', type: 'cash', opening_balance: 500 }),
  acct({ id: 2, name: 'BPI', type: 'bank', is_default: true }),
  acct({ id: 3, name: 'GCash', type: 'ewallet' }),
];

// The three postings exactly as ar.ts, ap.ts and payroll.ts build them.
const invoicePosting = (over: Record<string, unknown> = {}) => ({
  sourceType: 'invoice' as const, sourceId: 100, moduleSource: 'AR' as const,
  category: 'Client Payment', description: 'Client payment — Acme (OR-2026-001)',
  txnDate: '2026-08-14', referenceNo: 'OR-2026-001', accounts,
  projectId: 10, paymentMethod: 'GCash', cashIn: 25000, cashOut: 0,
  isCash: true, ...over,
});

const billPosting = (over: Record<string, unknown> = {}) => ({
  sourceType: 'bill' as const, sourceId: 200, moduleSource: 'AP' as const,
  category: 'Marketing', description: 'Expense — Printer',
  txnDate: '2026-08-14', referenceNo: 'EXP-2026-001', accounts,
  projectId: 10, paymentMethod: 'Cash', cashIn: 0, cashOut: 4000,
  isCash: true, ...over,
});

const payrollPosting = (over: Record<string, unknown> = {}) => ({
  sourceType: 'payroll' as const, sourceId: 300, moduleSource: 'Payroll' as const,
  category: 'Payroll', description: 'Payroll — Aug 2026 · J. Cruz',
  txnDate: '2026-08-15', referenceNo: 'PAY-2026-001', accounts,
  projectId: null, paymentMethod: 'Bank Transfer', cashIn: 0, cashOut: 9000,
  isCash: true, ...over,
});

beforeEach(() => {
  _rows = [];
  _nextId = 1;
});

describe('finance flow — a payment reaches the ledger', () => {
  it('posts a paid invoice as cash-in tagged AR', async () => {
    expect(await syncSourceLedger(invoicePosting())).toBe('posted');
    expect(_rows).toHaveLength(1);
    expect(_rows[0]).toMatchObject({
      module_source: 'AR', category: 'Client Payment',
      cash_in: 25000, cash_out: 0, source_type: 'invoice', source_id: 100,
    });
  });

  it('files it against the account the money actually landed in, not the default', async () => {
    await syncSourceLedger(invoicePosting());
    // GCash, not the default BPI — otherwise e-wallet income inflates the bank.
    expect(_rows[0].account_id).toBe(3);
  });

  it('does not double-post when the same payment is saved twice', async () => {
    await syncSourceLedger(invoicePosting());
    expect(await syncSourceLedger(invoicePosting())).toBe('unchanged');
    expect(_rows).toHaveLength(1);
  });

  it('posts nothing at all when no account exists yet', async () => {
    expect(await syncSourceLedger(invoicePosting({ accounts: [] }))).toBe('no-account');
    expect(_rows).toHaveLength(0);
  });
});

describe('finance flow — corrections follow the source document', () => {
  it('corrects the row when a paid invoice is edited, rather than adding another', async () => {
    await syncSourceLedger(invoicePosting());
    const result = await syncSourceLedger(invoicePosting({ cashIn: 30000, txnDate: '2026-08-20' }));

    expect(result).toBe('updated');
    expect(_rows).toHaveLength(1);
    expect(_rows[0].cash_in).toBe(30000);
    expect(_rows[0].txn_date).toBe('2026-08-20');
  });

  it('moves the row when the payment method changes', async () => {
    await syncSourceLedger(invoicePosting());
    await syncSourceLedger(invoicePosting({ paymentMethod: 'Cash' }));
    expect(_rows[0].account_id).toBe(1);
  });

  it('takes the money back off when an invoice is un-paid or cancelled', async () => {
    await syncSourceLedger(invoicePosting());
    expect(await syncSourceLedger(invoicePosting({ isCash: false }))).toBe('reversed');
    expect(_rows).toHaveLength(0);
  });

  it('removes the row when the source document is deleted', async () => {
    await syncSourceLedger(invoicePosting());
    expect(await reverseSourceFromLedger('invoice', 100)).toBe(true);
    expect(_rows).toHaveLength(0);
  });
});

describe('finance flow — expenses and payroll', () => {
  it('posts a paid expense as cash-out tagged AP', async () => {
    await syncSourceLedger(billPosting());
    expect(_rows[0]).toMatchObject({ module_source: 'AP', cash_out: 4000, cash_in: 0 });
  });

  it('posts a released payroll run as cash-out tagged Payroll', async () => {
    await syncSourceLedger(payrollPosting());
    expect(_rows[0]).toMatchObject({ module_source: 'Payroll', cash_out: 9000 });
  });

  // The path that was dead until payroll-allow-unpay.sql was applied.
  it('reverses a payroll run that is moved back off Paid', async () => {
    await syncSourceLedger(payrollPosting());
    expect(_rows).toHaveLength(1);
    expect(await syncSourceLedger(payrollPosting({ isCash: false }))).toBe('reversed');
    expect(_rows).toHaveLength(0);
  });
});

describe('finance flow — the ledger drives the dashboard and reports', () => {
  // One clean run: money in, an expense, a payroll run.
  const runTheFlow = async () => {
    await syncSourceLedger(invoicePosting());
    await syncSourceLedger(billPosting());
    await syncSourceLedger(payrollPosting());
  };

  it('moves the running balance and cash position by exactly what was posted', async () => {
    await runTheFlow();
    // Opening 500 on Cash on Hand, then 25000 in, 4000 out, 9000 out.
    expect(cashPosition(_rows, accounts).total).toBe(500 + 25000 - 4000 - 9000);
    expect(accountBalance(3, _rows, accounts)).toBe(25000);   // GCash
    expect(accountBalance(1, _rows, accounts)).toBe(500 - 4000); // Cash on Hand
    expect(accountBalance(2, _rows, accounts)).toBe(-9000);   // BPI
  });

  it('gives every row a running balance', async () => {
    await runTheFlow();
    const balances = runningBalanceMap(_rows, accounts);
    for (const row of _rows) expect(balances.get(row.id)).toBeTypeOf('number');
  });

  it('reports revenue and expenses that reconcile with the ledger', async () => {
    await runTheFlow();
    const summary = monthlySummary(_rows, [], ALL_PERIODS);

    expect(summary.revenue).toBe(25000);
    expect(summary.expenses).toBe(13000);        // 4000 marketing + 9000 payroll
    expect(summary.netProfit).toBe(12000);

    // Nothing was keyed in twice: the reported totals equal the ledger's own.
    const ledgerIn  = _rows.reduce((s, r) => s + (r.cash_in || 0), 0);
    const ledgerOut = _rows.reduce((s, r) => s + (r.cash_out || 0), 0);
    expect(summary.totalCashIn).toBe(ledgerIn);
    expect(summary.revenue - summary.expenses).toBe(ledgerIn - ledgerOut);
  });

  it('splits cost of services from operating expenses in the P&L', async () => {
    await runTheFlow();
    const pl = profitAndLoss(_rows, ALL_PERIODS);
    expect(pl.totalRevenue).toBe(25000);
    expect(pl.totalCostOfServices).toBe(9000);       // payroll
    expect(pl.totalOperatingExpenses).toBe(4000);    // marketing
    expect(pl.netProfit).toBe(12000);
  });

  it('drops the figures back out of the reports when the payment is reversed', async () => {
    await runTheFlow();
    await syncSourceLedger(invoicePosting({ isCash: false }));

    const summary = monthlySummary(_rows, [], ALL_PERIODS);
    expect(summary.revenue).toBe(0);
    expect(summary.netProfit).toBe(-13000);
    expect(cashPosition(_rows, accounts).total).toBe(500 - 13000);
  });
});
