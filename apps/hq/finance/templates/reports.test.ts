import { describe, it, expect } from 'vitest';
import { cashFlowTrendHTML, monthlyBarsHTML, chartHeadingHTML, barChartHTML } from './reports.ts';

// The drawn height of each bar, in document order — the containers around them
// carry heights of their own, so match on the bar's own width.
const barHeights = (html: string, width: number): number[] =>
  [...html.matchAll(new RegExp(`width:${width}px[^"]*?height:(\\d+)px`, 'g'))].map(m => Number(m[1]));

describe('chartHeadingHTML', () => {
  it('omits the source line when there is nothing to disambiguate', () => {
    expect(chartHeadingHTML('Expense by Category')).not.toContain('margin-top:3px');
  });

  it('escapes the title and the source', () => {
    const html = chartHeadingHTML('Revenue <b>', 'From "paid" invoices');
    expect(html).toContain('Revenue &lt;b&gt;');
    expect(html).toContain('&quot;paid&quot;');
  });
});

describe('monthlyBarsHTML', () => {
  const months = [
    { label: 'Jul', a: 0, b: 0 },
    { label: 'Aug', a: 5000, b: 2500 },
  ];

  // A 2px stub for zero was indistinguishable from a small real amount.
  it('draws nothing for a month with no activity', () => {
    const html = monthlyBarsHTML('Monthly', months, { a: 'Revenue', b: 'Expenses' }, { a: 'gold', b: 'grey' });
    const bars = barHeights(html, 12);
    expect(bars[0]).toBe(0);
    expect(bars[1]).toBe(0);
  });

  it('scales the bars against the largest figure in the range', () => {
    const html = monthlyBarsHTML('Monthly', months, { a: 'Revenue', b: 'Expenses' }, { a: 'gold', b: 'grey' });
    const bars = barHeights(html, 12);
    expect(bars[2]).toBe(64);   // Aug revenue is the max
    expect(bars[3]).toBe(32);   // Aug expenses, half of it
  });

  it('carries the amounts on the column for hover and screen readers', () => {
    const html = monthlyBarsHTML('Monthly', months, { a: 'Revenue', b: 'Expenses' }, { a: 'gold', b: 'grey' });
    expect(html).toContain('aria-label="Aug: Revenue ₱5,000 · Expenses ₱2,500"');
  });
});

describe('cashFlowTrendHTML', () => {
  const months = [
    { label: 'Jul', net: 40000 },
    { label: 'Aug', net: -40000 },
    { label: 'Sep', net: 0 },
  ];
  const html = cashFlowTrendHTML('Cash Flow Trend', months);

  // The bar height used to be the absolute value, so a month that lost ₱40,000
  // drew exactly like one that made it and only the colour differed.
  it('hangs a negative month below the zero line and a positive one above it', () => {
    const jul = html.slice(html.indexOf('Jul:'), html.indexOf('Aug:'));
    const aug = html.slice(html.indexOf('Aug:'), html.indexOf('Sep:'));
    expect(jul.indexOf('var(--green)')).toBeLessThan(jul.indexOf('align-items:flex-start'));
    expect(aug.indexOf('var(--red)')).toBeGreaterThan(aug.indexOf('align-items:flex-start'));
  });

  it('draws the zero line itself', () => {
    expect(html).toContain('position:absolute');
    expect(html).toContain('top:30px');
  });

  it('gives a break-even month no bar at all', () => {
    const sep = html.slice(html.indexOf('Sep:'));
    expect(sep).not.toContain('width:14px');
  });

  it('reads a loss out as negative rather than as its size alone', () => {
    expect(html).toContain('aria-label="Aug: net −₱40,000"');
  });
});

describe('barChartHTML', () => {
  it('shows an empty state instead of an axis when there is no data', () => {
    expect(barChartHTML('Expense by Category', [], 'red')).toContain('No data yet');
  });
});
