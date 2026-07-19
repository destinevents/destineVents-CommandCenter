import { describe, it, expect } from 'vitest';
import type { Invoice, Bill } from '@shared/types.ts';
import { calcFinanceSummary } from './financeService.ts';

const inv = (status: string, amount?: number) => ({ status, amount } as unknown as Invoice);
const bill = (status: string, amount?: number) => ({ status, amount } as unknown as Bill);

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
    const result = calcFinanceSummary([inv('Unpaid')], []);
    expect(result.arOutstanding).toBe(0);
  });
});
