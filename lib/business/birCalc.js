// BIR filing helpers — statutory deadlines, filing periods, and amounts computed
// from real finance data for the PH forms the Command Center tracks:
//   2551Q  Quarterly Percentage Tax (non-VAT)   — 3% of gross quarterly receipts
//   1701Q  Quarterly Income Tax (self-employed) — on net income for the quarter
//   1604C  Annual return on compensation withheld — from payroll withholding
//   2307   Certificate of Creditable Tax Withheld — issued per transaction (EWT)

const BIR_PERCENTAGE_TAX_RATE = 0.03; // 2551Q non-VAT rate
const BIR_8PCT_OPTION_RATE     = 0.08; // 1701Q optional 8% election on gross

// 0-based quarter index (0=Q1 … 3=Q4) of a month index (0-11)
function birQuarterIndex(month) { return Math.floor(month / 3); }

// { q, year } of the most recently *completed* calendar quarter as of `today`.
function birMostRecentCompletedQuarter(today = new Date()) {
  let q = birQuarterIndex(today.getMonth()) - 1;
  let year = today.getFullYear();
  if (q < 0) { q = 3; year -= 1; }
  return { q, year };
}

function birQuarterLabel(q, year) { return `Q${q + 1} ${year}`; }

// Statutory deadline (ISO yyyy-mm-dd) per form for a quarter/year.
function bir2551qDeadline(q, year) {
  // 25th day of the month following quarter-end
  const map = [[3, year], [6, year], [9, year], [0, year + 1]]; // [monthIdx, yr]
  const [m, y] = map[q];
  return `${y}-${String(m + 1).padStart(2, '0')}-25`;
}

function bir1701qDeadline(q, year) {
  // Q1→May 15, Q2→Aug 15, Q3→Nov 15 (there is no Q4 quarterly income-tax return)
  const map = { 0: [4, year], 1: [7, year], 2: [10, year] };
  if (!(q in map)) return null;
  const [m, y] = map[q];
  return `${y}-${String(m + 1).padStart(2, '0')}-15`;
}

function bir1604cDeadline(year) {
  // Annual information return on compensation withheld — Jan 31 of the following year
  return `${year + 1}-01-31`;
}

function birDaysUntil(deadlineISO, today = new Date()) {
  const d = new Date(deadlineISO + 'T00:00:00');
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((d - t) / 86400000);
}

// 'Filed' | 'Overdue' | 'Due Soon' | 'Upcoming' | 'Ongoing'
function birFilingStatus(deadlineISO, isFiled, today = new Date()) {
  if (isFiled) return 'Filed';
  if (!deadlineISO) return 'Ongoing';
  const days = birDaysUntil(deadlineISO, today);
  if (days < 0) return 'Overdue';
  if (days <= 30) return 'Due Soon';
  return 'Upcoming';
}

// Does an ISO date string fall within quarter q of `year`?
function birDateInQuarter(iso, q, year) {
  if (!iso) return false;
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d.getTime())) return false;
  return d.getFullYear() === year && birQuarterIndex(d.getMonth()) === q;
}

// Gross receipts = paid invoices dated within the quarter.
function birGrossReceipts(invoices, q, year) {
  return invoices
    .filter(i => i.status === 'Paid' && birDateInQuarter(i.date, q, year))
    .reduce((s, i) => s + (i.amount || 0), 0);
}

// Deductible expenses = paid bills dated within the quarter.
function birExpenses(bills, q, year) {
  return bills
    .filter(b => b.status === 'Paid' && birDateInQuarter(b.date, q, year))
    .reduce((s, b) => s + (b.amount || 0), 0);
}

// Total compensation withholding across payroll runs in the year (1604C base).
function birCompWithholding(payroll, year) {
  return payroll
    .filter(r => String(r.period || '').includes(String(year)))
    .reduce((s, r) => s + (r.deductions || 0), 0);
}

// Bills carrying a non-zero EWT rate — each needs a 2307 issued to the payee.
function bir2307Bills(bills) {
  return bills.filter(b => b.ewt && b.ewt !== '0%' && b.ewt !== '0');
}

// Was a filing already recorded for this form + period?
function birIsFiled(filings, form, period) {
  return filings.some(f => f.form === form && f.period === period);
}

// Filings recorded for a form, newest first (already ordered by service, but be safe).
function birFilingsFor(filings, form) {
  return filings
    .filter(f => f.form === form)
    .sort((a, b) => String(b.filed_at).localeCompare(String(a.filed_at)));
}
