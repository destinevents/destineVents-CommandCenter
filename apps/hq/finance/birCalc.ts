// BIR filing helpers — statutory deadlines, filing periods, and amounts computed
// from real finance data for the PH forms the Command Center tracks:
//   2551Q  Quarterly Percentage Tax (non-VAT)   — 3% of gross quarterly receipts
//   1701Q  Quarterly Income Tax (self-employed) — on net income for the quarter
//   1604C  Annual return on compensation withheld — from payroll withholding
//   2307   Certificate of Creditable Tax Withheld — issued per transaction (EWT)

import type { Invoice, Bill, PayrollRun, BirFiling } from '@shared/types';

export const BIR_PERCENTAGE_TAX_RATE = 0.03; // 2551Q non-VAT rate
export const BIR_8PCT_OPTION_RATE     = 0.08; // 1701Q optional 8% election on gross

// 0-based quarter index (0=Q1 … 3=Q4) of a month index (0-11)
export function birQuarterIndex(month: number): number { return Math.floor(month / 3); }

// { q, year } of the most recently *completed* calendar quarter as of `today`.
export function birMostRecentCompletedQuarter(today = new Date()): { q: number; year: number } {
  let q = birQuarterIndex(today.getMonth()) - 1;
  let year = today.getFullYear();
  if (q < 0) { q = 3; year -= 1; }
  return { q, year };
}

export function birQuarterLabel(q: number, year: number): string { return `Q${q + 1} ${year}`; }

// Statutory deadline (ISO yyyy-mm-dd) per form for a quarter/year.
export function bir2551qDeadline(q: number, year: number): string {
  // 25th day of the month following quarter-end
  const map: [number, number][] = [[3, year], [6, year], [9, year], [0, year + 1]];
  const [m, y] = map[q];
  return `${y}-${String(m + 1).padStart(2, '0')}-25`;
}

export function bir1701qDeadline(q: number, year: number): string | null {
  // Q1→May 15, Q2→Aug 15, Q3→Nov 15 (there is no Q4 quarterly income-tax return)
  const map: Record<number, [number, number]> = { 0: [4, year], 1: [7, year], 2: [10, year] };
  if (!(q in map)) return null;
  const [m, y] = map[q];
  return `${y}-${String(m + 1).padStart(2, '0')}-15`;
}

export function bir1604cDeadline(year: number): string {
  // Annual information return on compensation withheld — Jan 31 of the following year
  return `${year + 1}-01-31`;
}

export function birDaysUntil(deadlineISO: string, today = new Date()): number {
  const d = new Date(deadlineISO + 'T00:00:00');
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((d.getTime() - t.getTime()) / 86400000);
}

// 'Filed' | 'Overdue' | 'Due Soon' | 'Upcoming' | 'Ongoing'
export function birFilingStatus(deadlineISO: string | null, isFiled: boolean, today = new Date()): string {
  if (isFiled) return 'Filed';
  if (!deadlineISO) return 'Ongoing';
  const days = birDaysUntil(deadlineISO, today);
  if (days < 0) return 'Overdue';
  if (days <= 30) return 'Due Soon';
  return 'Upcoming';
}

// Does an ISO date string fall within quarter q of `year`?
export function birDateInQuarter(iso: string | null, q: number, year: number): boolean {
  if (!iso) return false;
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d.getTime())) return false;
  return d.getFullYear() === year && birQuarterIndex(d.getMonth()) === q;
}

// Gross receipts = paid invoices dated within the quarter.
export function birGrossReceipts(invoices: Invoice[], q: number, year: number): number {
  return invoices
    .filter(i => i.status === 'Paid' && birDateInQuarter(i.date, q, year))
    .reduce((s, i) => s + (i.amount || 0), 0);
}

// Deductible expenses = paid bills dated within the quarter.
export function birExpenses(bills: Bill[], q: number, year: number): number {
  return bills
    .filter(b => b.status === 'Paid' && birDateInQuarter(b.date, q, year))
    .reduce((s, b) => s + (b.amount || 0), 0);
}

// Total compensation withholding across payroll runs in the year (1604C base).
export function birCompWithholding(payroll: PayrollRun[], year: number): number {
  return payroll
    .filter(r => r.status === 'Paid' && String(r.period || '').includes(String(year)))
    .reduce((s, r) => s + (r.deductions || 0), 0);
}

// Bills carrying a non-zero EWT rate — each needs a 2307 issued to the payee.
export function bir2307Bills(bills: Bill[]): Bill[] {
  return bills.filter(b => (b as any).ewt && (b as any).ewt !== '0%' && (b as any).ewt !== '0');
}

// Was a filing already recorded for this form + period?
export function birIsFiled(filings: BirFiling[], form: string, period: string): boolean {
  return filings.some(f => f.form === form && f.period === period);
}

// Filings recorded for a form, newest first (already ordered by service, but be safe).
export function birFilingsFor(filings: BirFiling[], form: string): BirFiling[] {
  return filings
    .filter(f => f.form === form)
    .sort((a, b) => String(b.filed_at).localeCompare(String(a.filed_at)));
}
