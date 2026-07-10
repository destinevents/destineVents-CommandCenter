// Tests the SHIPPED lib/business/birCalc.js. `globals: true` provides describe/it/expect.
const {
  birMostRecentCompletedQuarter, birQuarterLabel,
  bir2551qDeadline, bir1701qDeadline, bir1604cDeadline,
  birFilingStatus, birDateInQuarter, birGrossReceipts, birExpenses,
  bir2307Bills, birIsFiled, BIR_PERCENTAGE_TAX_RATE,
} = require('./birCalc.js');

const JUL_10_2026 = new Date('2026-07-10T12:00:00');

describe('birMostRecentCompletedQuarter', () => {
  it('returns Q2 2026 in July 2026', () => {
    const { q, year } = birMostRecentCompletedQuarter(JUL_10_2026);
    expect(birQuarterLabel(q, year)).toBe('Q2 2026');
  });
  it('rolls back to Q4 of the previous year in January', () => {
    const { q, year } = birMostRecentCompletedQuarter(new Date('2026-01-15T12:00:00'));
    expect(birQuarterLabel(q, year)).toBe('Q4 2025');
  });
});

describe('deadlines', () => {
  it('2551Q for Q2 is 25 days after quarter-end (Jul 25)', () => {
    expect(bir2551qDeadline(1, 2026)).toBe('2026-07-25');
  });
  it('2551Q for Q4 rolls into January of next year', () => {
    expect(bir2551qDeadline(3, 2026)).toBe('2027-01-25');
  });
  it('1701Q for Q2 is Aug 15', () => {
    expect(bir1701qDeadline(1, 2026)).toBe('2026-08-15');
  });
  it('1701Q has no Q4 quarterly return', () => {
    expect(bir1701qDeadline(3, 2026)).toBeNull();
  });
  it('1604C is Jan 31 of the following year', () => {
    expect(bir1604cDeadline(2026)).toBe('2027-01-31');
  });
});

describe('birFilingStatus', () => {
  it('is Filed when a record exists regardless of date', () => {
    expect(birFilingStatus('2026-07-25', true, JUL_10_2026)).toBe('Filed');
  });
  it('is Due Soon within 30 days of the deadline', () => {
    expect(birFilingStatus('2026-07-25', false, JUL_10_2026)).toBe('Due Soon');
  });
  it('is Upcoming when more than 30 days out', () => {
    expect(birFilingStatus('2026-08-15', false, JUL_10_2026)).toBe('Upcoming');
  });
  it('is Overdue when past the deadline', () => {
    expect(birFilingStatus('2026-07-01', false, JUL_10_2026)).toBe('Overdue');
  });
});

describe('quarter membership and amounts', () => {
  const invoices = [
    { status: 'Paid', date: '2026-05-10', amount: 50000 },
    { status: 'Paid', date: '2026-07-05', amount: 9999 }, // Q3, excluded
    { status: 'Unpaid', date: '2026-06-01', amount: 8000 }, // unpaid, excluded
  ];
  const bills = [
    { status: 'Paid', date: '2026-04-20', amount: 12000, ewt: '5%' },
    { status: 'Paid', date: '2026-06-30', amount: 3000, ewt: '0%' },
  ];

  it('counts only paid invoices dated within the quarter as gross receipts', () => {
    expect(birGrossReceipts(invoices, 1, 2026)).toBe(50000);
  });
  it('sums paid bills within the quarter as expenses', () => {
    expect(birExpenses(bills, 1, 2026)).toBe(15000);
  });
  it('percentage tax rate is 3%', () => {
    expect(BIR_PERCENTAGE_TAX_RATE).toBe(0.03);
  });
  it('flags only bills carrying a non-zero EWT rate for 2307', () => {
    expect(bir2307Bills(bills)).toHaveLength(1);
  });
  it('birDateInQuarter excludes out-of-quarter dates', () => {
    expect(birDateInQuarter('2026-07-05', 1, 2026)).toBe(false);
    expect(birDateInQuarter('2026-05-10', 1, 2026)).toBe(true);
  });
});

describe('birIsFiled', () => {
  const filings = [{ form: '2551Q', period: 'Q2 2026' }];
  it('is true when a matching form+period filing exists', () => {
    expect(birIsFiled(filings, '2551Q', 'Q2 2026')).toBe(true);
  });
  it('is false for a different period', () => {
    expect(birIsFiled(filings, '2551Q', 'Q1 2026')).toBe(false);
  });
});
