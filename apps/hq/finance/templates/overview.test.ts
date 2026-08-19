import { describe, it, expect } from 'vitest';
import {
  attentionBandHTML, attentionItems, deltaHTML, detailStripHTML,
  kpiCardHTML, kpiRowHTML,
} from './overview.ts';
import type { FinanceSummary } from '@shared/types.ts';

const summary = (over: Partial<FinanceSummary> = {}): FinanceSummary => ({
  arOutstanding: 0, apOutstanding: 0, netPosition: 0, revenueCollected: 0,
  collectedThisMonth: 0, expensesPaid: 0, netProfit: 0,
  overdueCount: 0, overdueTotal: 0, pendingBillsCount: 0, payrollDue: 0,
  cashFlowThisMonth: 0, collectedToday: 0, avgCollectionDays: 0,
  ...over,
});

describe('deltaHTML', () => {
  const july = { periodLabel: 'July' };

  // Direction and sentiment are different things: expenses climbing is not the
  // good news that revenue climbing is.
  it('reads a rise as good for revenue and bad for expenses', () => {
    expect(deltaHTML(150, 100, { ...july, higherIsBetter: true })).toContain('is-good');
    expect(deltaHTML(150, 100, { ...july, higherIsBetter: false })).toContain('is-bad');
  });

  it('reads a fall the other way round', () => {
    expect(deltaHTML(50, 100, { ...july, higherIsBetter: true })).toContain('is-bad');
    expect(deltaHTML(50, 100, { ...july, higherIsBetter: false })).toContain('is-good');
  });

  it('states the size and direction of the move', () => {
    expect(deltaHTML(150, 100, { ...july, higherIsBetter: true })).toContain('▲ 50% vs July');
    expect(deltaHTML(75, 100, { ...july, higherIsBetter: true })).toContain('▼ 25% vs July');
  });

  // Percentages against nothing are the classic dashboard divide-by-zero.
  it('says something truthful when the previous period was empty', () => {
    const html = deltaHTML(5000, 0, { ...july, higherIsBetter: true });
    expect(html).toContain('First activity since July');
    expect(html).not.toContain('Infinity');
    expect(html).not.toContain('NaN');
  });

  it('treats two empty periods as no activity rather than a 0% move', () => {
    expect(deltaHTML(0, 0, { ...july, higherIsBetter: true })).toContain('No activity vs July');
  });

  it('marks an unchanged figure as level', () => {
    expect(deltaHTML(100, 100, { ...july, higherIsBetter: true })).toContain('Level vs July');
  });

  // A loss shrinking is an improvement, and the sign of the base must not flip
  // the reading.
  it('handles a negative previous figure', () => {
    expect(deltaHTML(-50, -100, { ...july, higherIsBetter: true })).toContain('▲ 50% vs July');
  });
});

describe('attention band', () => {
  it('says so plainly when there is nothing to chase', () => {
    const html = attentionBandHTML(summary());
    expect(html).toContain('Nothing needs chasing');
    expect(html).not.toContain('attn-chip');
  });

  it('raises overdue invoices, unpaid bills and payroll, each pointing at its tab', () => {
    const items = attentionItems(summary({
      overdueCount: 2, overdueTotal: 8000,
      pendingBillsCount: 1, apOutstanding: 1200,
      payrollDue: 4500,
    }));
    expect(items.map(i => i.tab)).toEqual(['receivables', 'payables', 'payroll']);
    expect(items[0].text).toBe('2 overdue invoices');
    expect(items[1].text).toBe('1 bill to pay');
  });

  it('leaves out what is already settled', () => {
    const items = attentionItems(summary({ overdueCount: 1, overdueTotal: 500 }));
    expect(items).toHaveLength(1);
  });

  it('opens the matching tab from the chip', () => {
    const html = attentionBandHTML(summary({ overdueCount: 1, overdueTotal: 500 }));
    expect(html).toContain(`showFinanceTab('receivables')`);
  });
});

describe('kpiCardHTML', () => {
  // Every card used to light up under the pointer; none of them went anywhere.
  it('only marks a card as a link when it has somewhere to go', () => {
    expect(kpiCardHTML({ label: 'Owed to Us', value: 100, tab: 'receivables' })).toContain('is-link');
    expect(kpiCardHTML({ label: 'Net Profit', value: 100 })).not.toContain('is-link');
  });

  it('gives a clickable card a keyboard route too', () => {
    const html = kpiCardHTML({ label: 'We Owe', value: 100, tab: 'payables' });
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('role="button"');
    expect(html).toContain("event.key==='Enter'");
  });

  it('escapes the label and the sub-line', () => {
    const html = kpiCardHTML({ label: '<b>Cash</b>', value: 0, sub: 'a & b' });
    expect(html).toContain('&lt;b&gt;Cash&lt;/b&gt;');
    expect(html).toContain('a &amp; b');
  });

  it('renders a row as label plus one card each', () => {
    const html = kpiRowHTML('Where we stand', [
      { label: 'Cash on Hand', value: 1 },
      { label: 'Owed to Us', value: 2 },
    ], 'hero');
    expect(html).toContain('Where we stand');
    expect(html.match(/is-hero/g)).toHaveLength(3);   // the row plus both cards
  });
});

describe('detailStripHTML', () => {
  it('lays reference figures out as rows under a column heading', () => {
    const html = detailStripHTML([
      { title: '2026 so far', rows: [{ label: 'Revenue', value: '₱5,000' }] },
    ]);
    expect(html).toContain('2026 so far');
    expect(html).toContain('detail-row');
    expect(html).not.toContain('stat-card');
  });
});
