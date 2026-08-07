import { describe, it, expect } from 'vitest';
import type { Invoice, Bill } from '@shared/types.ts';
import { calcFinanceSummary, billPaidDate } from './financeService.ts';

// Fixed clock so month/day boundaries are deterministic.
const NOW = new Date(2026, 7, 6, 9, 0, 0); // 2026-08-06 local

const inv = (status: string, amount?: number, over: Partial<Invoice> = {}) =>
  ({ status, amount, due: null, date: null, payment_date: null, archived_at: null, ...over } as unknown as Invoice);
const bill = (status: string, amount?: number, over: Partial<Bill> = {}) =>
  ({ status, amount, date: null, paid_at: null, archived_at: null, ...over } as unknown as Bill);

const summary = (invoices: Invoice[], bills: Bill[] = []) =>
  calcFinanceSummary(invoices, bills, [], NOW);

describe('calcFinanceSummary', () => {
  it('calculates AR outstanding from unpaid invoices only', () => {
    expect(summary([inv('Unpaid', 5000), inv('Paid', 3000)]).arOutstanding).toBe(5000);
  });

  it('calculates revenue collected from paid invoices only', () => {
    expect(summary([inv('Paid', 3000), inv('Unpaid', 1000)]).revenueCollected).toBe(3000);
  });

  it('calculates net position as revenue minus AP outstanding', () => {
    expect(summary([inv('Paid', 5000)], [bill('Unpaid', 2000)]).netPosition).toBe(3000);
  });

  it('returns zeros when both arrays are empty', () => {
    const result = summary([], []);
    expect(result.arOutstanding).toBe(0);
    expect(result.revenueCollected).toBe(0);
    expect(result.overdueCount).toBe(0);
  });

  it('treats missing amount field as zero', () => {
    expect(summary([inv('Unpaid')]).arOutstanding).toBe(0);
  });

  // ── Cancelled / archived no longer inflate the cards ───────────────────────
  it('excludes cancelled invoices from AR outstanding', () => {
    expect(summary([inv('Issued', 5000), inv('Cancelled', 9000)]).arOutstanding).toBe(5000);
  });

  it('excludes archived invoices from AR outstanding', () => {
    const archived = inv('Issued', 9000, { archived_at: '2026-08-01T00:00:00Z' });
    expect(summary([inv('Issued', 5000), archived]).arOutstanding).toBe(5000);
  });

  it('excludes archived invoices from revenue collected', () => {
    const archived = inv('Paid', 9000, { archived_at: '2026-08-01T00:00:00Z' });
    expect(summary([inv('Paid', 3000), archived]).revenueCollected).toBe(3000);
  });

  it('excludes archived bills from AP outstanding', () => {
    const archived = bill('Pending', 9000, { archived_at: '2026-08-01T00:00:00Z' });
    expect(summary([], [bill('Pending', 2000), archived]).apOutstanding).toBe(2000);
  });

  // ── Overdue is derived from the due date, never stored ─────────────────────
  it('derives overdue from the due date without a stored status', () => {
    const result = summary([
      inv('Issued', 1500, { due: '2026-07-01' }),
      inv('Issued', 500,  { due: '2026-08-05' }),
      inv('Issued', 4000, { due: '2026-09-01' }),
    ]);
    expect(result.overdueCount).toBe(2);
    expect(result.overdueTotal).toBe(2000);
  });

  it('does not count paid or cancelled invoices as overdue', () => {
    const result = summary([
      inv('Paid', 1000, { due: '2026-01-01' }),
      inv('Cancelled', 1000, { due: '2026-01-01' }),
    ]);
    expect(result.overdueCount).toBe(0);
    expect(result.overdueTotal).toBe(0);
  });

  it('still honours a manually stored Overdue status past its due date', () => {
    expect(summary([inv('Overdue', 1500, { due: '2026-07-01' })]).overdueCount).toBe(1);
  });

  // ── Collected / paid figures key off the date cash moved ───────────────────
  it('counts collections in the month the payment landed', () => {
    const result = summary([
      inv('Paid', 1000, { date: '2026-06-01', payment_date: '2026-08-03' }),
      inv('Paid', 250,  { date: '2026-08-01', payment_date: '2026-07-30' }),
    ]);
    expect(result.collectedThisMonth).toBe(1000);
  });

  it('counts collections landing today', () => {
    const result = summary([
      inv('Paid', 700, { payment_date: '2026-08-06' }),
      inv('Paid', 300, { payment_date: '2026-08-05' }),
    ]);
    expect(result.collectedToday).toBe(700);
  });

  it('counts an expense in the month it was paid, not the month it was dated', () => {
    const result = summary([], [
      bill('Paid', 4000, { date: '2026-06-15', paid_at: '2026-08-02' }),
      bill('Paid', 900,  { date: '2026-08-15', paid_at: '2026-07-02' }),
    ]);
    // 4000 paid in Aug; the Jun-dated bill no longer hides from the Aug figure.
    expect(result.cashFlowThisMonth).toBe(-4000);
  });

  it('falls back to the bill date when paid_at has not been backfilled', () => {
    const result = summary([], [bill('Paid', 500, { date: '2026-08-04', paid_at: null })]);
    expect(result.cashFlowThisMonth).toBe(-500);
  });
});

describe('billPaidDate', () => {
  it('prefers paid_at', () => {
    expect(billPaidDate(bill('Paid', 1, { date: '2026-06-01', paid_at: '2026-08-02' }))).toBe('2026-08-02');
  });

  it('falls back to the bill date', () => {
    expect(billPaidDate(bill('Paid', 1, { date: '2026-06-01' }))).toBe('2026-06-01');
  });

  it('tolerates a full timestamp', () => {
    expect(billPaidDate(bill('Paid', 1, { paid_at: '2026-08-02T10:00:00Z' }))).toBe('2026-08-02');
  });
});
