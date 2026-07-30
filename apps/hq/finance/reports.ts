// Reports (§7) — Profit & Loss, Cash Flow Statement, Revenue, Expense,
// Project Profitability, Founder Capital, Bank Ledger, Monthly Financial
// Summary. All derived from the Cash Ledger; export to CSV or PDF (print).
import { formatCurrency } from '@shared/utils/formatUtils.ts';
import { escapeHtml } from '@shared/utils/helpers.ts';
import { formatDateShort } from '@shared/utils/dateUtils.ts';
import { downloadCSV, downloadExcel, printHTML } from '@shared/utils/exportUtils.ts';
import { toast } from '@hq/core/ui.ts';
import { _ledger, _accounts, _founderCapital, _projects } from '@hq/core/state.ts';
import {
  profitAndLoss, cashFlowStatement, projectProfitability, monthlySummary,
  revenueByCategory, expenseByCategory, filterEntries, availableYears,
  type PeriodFilter,
} from './reportsCalc.ts';
import { runningBalanceMap, founderEquity } from './ledgerCalc.ts';
import {
  periodFilterHTML, categoryTableHTML, summaryCard, monthLabel,
} from './templates/reports.ts';

type ReportType = 'pl' | 'cashflow' | 'revenue' | 'expense' | 'project' | 'founder' | 'bank' | 'summary';

const REPORT_TYPES: ReadonlyArray<{ value: ReportType; label: string }> = [
  { value: 'pl',       label: 'Profit & Loss' },
  { value: 'cashflow', label: 'Cash Flow Statement' },
  { value: 'revenue',  label: 'Revenue Report' },
  { value: 'expense',  label: 'Expense Report' },
  { value: 'project',  label: 'Project Profitability' },
  { value: 'founder',  label: 'Founder Capital Report' },
  { value: 'bank',     label: 'Bank Ledger' },
  { value: 'summary',  label: 'Monthly Financial Summary' },
];

let _repType: ReportType = 'pl';
let _repYear: number | null = new Date().getFullYear();
let _repMonth: number | null = null;
let _repProject: number | null = null;

const _filter = (): PeriodFilter => ({ year: _repYear, month: _repMonth, projectId: _repProject });
const _scopeLabel = (): string => `${_repYear ?? 'All years'}${_repYear ? ` · ${monthLabel(_repMonth)}` : ''}`;
const _reportLabel = (): string => REPORT_TYPES.find(r => r.value === _repType)?.label ?? 'Report';

// ── Render ────────────────────────────────────────────────────────────────────

export function renderReports(): void {
  const container = document.getElementById('ftab-reports');
  if (!container) return;

  const typeSelect = `<select class="form-input" id="rep-type" onchange="setReportType()" style="width:200px">
    ${REPORT_TYPES.map(r => `<option value="${r.value}"${r.value === _repType ? ' selected' : ''}>${r.label}</option>`).join('')}
  </select>`;
  const exportBtns = `
    <button class="btn btn-ghost" onclick="exportFinanceReportExcel()" style="font-size:12px">Export Excel</button>
    <button class="btn btn-ghost" onclick="exportFinanceReportCSV()" style="font-size:12px">Export CSV</button>
    <button class="btn btn-ghost" onclick="printFinanceReport()" style="font-size:12px">Print / PDF</button>`;

  container.innerHTML = `
    <div class="page-actions" style="margin-bottom:12px;gap:8px;align-items:center">
      ${typeSelect}
      <div style="flex:1"></div>
      ${exportBtns}
    </div>
    ${periodFilterHTML({
      years: availableYears(_ledger),
      year: _repYear, month: _repMonth, projectId: _repProject,
      projects: _projects, onChange: 'setReportFilter',
      showProject: _repType === 'pl' || _repType === 'revenue' || _repType === 'expense' || _repType === 'summary',
    })}
    <div id="rep-body">${_reportBodyHTML()}</div>`;
}

function _reportBodyHTML(): string {
  switch (_repType) {
    case 'pl':       return _plHTML();
    case 'cashflow': return _cashflowHTML();
    case 'revenue':  return _categoryReportHTML('revenue');
    case 'expense':  return _categoryReportHTML('expense');
    case 'project':  return _projectHTML();
    case 'founder':  return _founderHTML();
    case 'bank':     return _bankHTML();
    case 'summary':  return _summaryHTML();
  }
}

function _twoCol(a: string, b: string): string {
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">${a}${b}</div>`;
}

function _plHTML(): string {
  const pl = profitAndLoss(_ledger, _filter());
  return `
    <div class="finance-stat-grid" style="margin-bottom:16px">
      ${summaryCard('Total Revenue', pl.totalRevenue, { color: 'var(--green)' })}
      ${summaryCard('Gross Income', pl.grossIncome, { sub: 'Revenue − cost of services' })}
      ${summaryCard('Operating Expenses', pl.totalOperatingExpenses, { color: 'var(--red)' })}
      ${summaryCard('Net Profit', pl.netProfit, { color: pl.netProfit >= 0 ? 'var(--green)' : 'var(--red)' })}
    </div>
    ${_twoCol(
      categoryTableHTML('Revenue', pl.revenue, pl.totalRevenue, 'var(--green)'),
      categoryTableHTML('Cost of Services', pl.costOfServices, pl.totalCostOfServices, 'var(--red)'),
    )}
    <div style="margin-top:16px">${categoryTableHTML('Operating Expenses', pl.operatingExpenses, pl.totalOperatingExpenses, 'var(--red)')}</div>`;
}

function _cashflowHTML(): string {
  const cf = cashFlowStatement(_ledger, _accounts, _filter());
  const row = (label: string, val: number, color = '') =>
    `<tr><td style="color:var(--ink-2)">${label}</td><td class="amount-cell"${color ? ` style="color:${color}"` : ''}>${formatCurrency(val)}</td></tr>`;
  return `<div class="card" style="padding:16px;max-width:560px">
    <table class="ledger-table" style="margin-top:0">
      <tbody>
        <tr><td colspan="2" style="font-weight:700;color:var(--ink);padding-top:6px">Operating Activities</td></tr>
        ${row('Cash received (operations)', cf.operatingIn, 'var(--green)')}
        ${row('Cash paid (operations)', -cf.operatingOut, 'var(--red)')}
        ${row('Net operating cash flow', cf.operatingNet)}
        <tr><td colspan="2" style="font-weight:700;color:var(--ink);padding-top:12px">Financing Activities</td></tr>
        ${row('Founder capital in', cf.financingIn, 'var(--green)')}
        ${row('Founder withdrawals', -cf.financingOut, 'var(--red)')}
        ${row('Net financing cash flow', cf.financingNet)}
      </tbody>
      <tfoot>
        <tr style="border-top:2px solid var(--ink-4)"><td style="font-weight:700">Net Change in Cash</td><td class="amount-cell" style="font-weight:700;color:${cf.netChange >= 0 ? 'var(--green)' : 'var(--red)'}">${formatCurrency(cf.netChange)}</td></tr>
        <tr><td style="font-weight:700">Ending Cash Balance</td><td class="amount-cell" style="font-weight:700">${formatCurrency(cf.endingCash)}</td></tr>
      </tfoot>
    </table>
  </div>`;
}

function _categoryReportHTML(kind: 'revenue' | 'expense'): string {
  const rows = filterEntries(_ledger, _filter());
  const cats = kind === 'revenue' ? revenueByCategory(rows) : expenseByCategory(rows);
  const total = cats.reduce((s, c) => s + c.amount, 0);
  const title = kind === 'revenue' ? 'Revenue' : 'Expenses';
  const color = kind === 'revenue' ? 'var(--green)' : 'var(--red)';
  return `<div style="max-width:560px">${categoryTableHTML(title, cats, total, color)}</div>`;
}

function _projectHTML(): string {
  const rows = projectProfitability(_ledger, _projects, _filter());
  const body = rows.length
    ? rows.map(r => `<tr>
        <td style="font-weight:500;color:var(--ink)">${escapeHtml(r.name)}</td>
        <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(r.code)}</td>
        <td class="amount-cell" style="color:var(--green)">${formatCurrency(r.revenue)}</td>
        <td class="amount-cell" style="color:var(--red)">${formatCurrency(r.expenses)}</td>
        <td class="amount-cell" style="font-weight:600;color:${r.net >= 0 ? 'var(--green)' : 'var(--red)'}">${formatCurrency(r.net)}</td>
      </tr>`).join('')
    : `<tr><td colspan="5"><div class="empty-state">No project transactions yet</div></td></tr>`;
  return `<div style="border:1px solid var(--ink-4);overflow-x:auto">
    <table class="ledger-table">
      <thead><tr><th>Project</th><th>Code</th><th>Revenue</th><th>Expenses</th><th>Net Profit</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function _founderHTML(): string {
  const eq = founderEquity(_founderCapital);
  const rows = [..._founderCapital].sort((a, b) => (b.txn_date ?? '').localeCompare(a.txn_date ?? ''));
  const body = rows.length
    ? rows.map(f => `<tr>
        <td style="font-size:11px;color:var(--ink-3)">${f.txn_date ? formatDateShort(f.txn_date) : '—'}</td>
        <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(f.reference_no ?? '—')}</td>
        <td style="color:var(--ink-2)">${escapeHtml(f.transaction_type)}</td>
        <td class="amount-cell" style="color:${f.transaction_type === 'Capital Contribution' ? 'var(--green)' : 'var(--red)'}">${formatCurrency(f.amount)}</td>
      </tr>`).join('')
    : `<tr><td colspan="4"><div class="empty-state">No founder transactions yet</div></td></tr>`;
  return `
    <div class="finance-stat-grid" style="margin-bottom:16px">
      ${summaryCard('Capital Invested', eq.totalCapital, { color: 'var(--green)' })}
      ${summaryCard('Owner Withdrawals', eq.totalWithdrawals, { color: 'var(--red)' })}
      ${summaryCard('Net Owner Equity', eq.netEquity, { sub: 'Capital − withdrawals' })}
    </div>
    <div style="border:1px solid var(--ink-4);overflow-x:auto">
      <table class="ledger-table">
        <thead><tr><th>Date</th><th>Ref #</th><th>Type</th><th>Amount</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function _bankHTML(): string {
  const rows = filterEntries(_ledger, { ..._filter(), projectId: null });
  const balances = runningBalanceMap(_ledger, _accounts);
  const sorted = [...rows].sort((a, b) => (a.txn_date ?? '').localeCompare(b.txn_date ?? '') || a.id - b.id);
  const acctName = (id: number | null) => _accounts.find(a => a.id === id)?.name ?? '—';
  const body = sorted.length
    ? sorted.map(e => `<tr>
        <td style="font-size:11px;color:var(--ink-3)">${e.txn_date ? formatDateShort(e.txn_date) : '—'}</td>
        <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(acctName(e.account_id))}</td>
        <td style="color:var(--ink-2)">${escapeHtml(e.description)}</td>
        <td class="amount-cell" style="color:var(--green)">${e.cash_in ? formatCurrency(e.cash_in) : '—'}</td>
        <td class="amount-cell" style="color:var(--red)">${e.cash_out ? formatCurrency(e.cash_out) : '—'}</td>
        <td class="amount-cell" style="font-weight:600">${Number.isNaN(balances.get(e.id) ?? NaN) ? '—' : formatCurrency(balances.get(e.id)!)}</td>
      </tr>`).join('')
    : `<tr><td colspan="6"><div class="empty-state">No entries in this period</div></td></tr>`;
  return `<div style="border:1px solid var(--ink-4);overflow-x:auto">
    <table class="ledger-table">
      <thead><tr><th>Date</th><th>Account</th><th>Description</th><th>Cash In</th><th>Cash Out</th><th>Balance</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function _summaryHTML(): string {
  const s = monthlySummary(_ledger, _founderCapital, _filter());
  return `<div class="finance-stat-grid">
    ${summaryCard('Revenue', s.revenue, { color: 'var(--green)' })}
    ${summaryCard('Expenses', s.expenses, { color: 'var(--red)' })}
    ${summaryCard('Gross Profit', s.grossProfit)}
    ${summaryCard('Net Profit', s.netProfit, { color: s.netProfit >= 0 ? 'var(--green)' : 'var(--red)' })}
    ${summaryCard('Cash Flow', s.netCashFlow)}
    ${summaryCard('Collections', s.collections)}
    ${summaryCard('Payments', s.payments)}
    ${summaryCard('Founder Contributions', s.founderContributions)}
    ${summaryCard('Founder Withdrawals', s.founderWithdrawals)}
  </div>`;
}

// ── Filter + type handlers ──────────────────────────────────────────────────────

export function setReportType(): void {
  const v = (document.getElementById('rep-type') as HTMLSelectElement | null)?.value as ReportType | undefined;
  if (v) _repType = v;
  renderReports();
}

export function setReportFilter(): void {
  const yearVal = (document.getElementById('rep-year') as HTMLSelectElement | null)?.value ?? '';
  const monthVal = (document.getElementById('rep-month') as HTMLSelectElement | null)?.value ?? '';
  const projVal = (document.getElementById('rep-project') as HTMLSelectElement | null)?.value ?? '';
  _repYear = yearVal ? Number(yearVal) : null;
  _repMonth = monthVal ? Number(monthVal) : null;
  _repProject = projVal ? Number(projVal) : null;
  renderReports();
}

// ── Exports (CSV / PDF) ─────────────────────────────────────────────────────────

function _csvRows(): (string | number)[][] {
  const rows: (string | number)[][] = [[`${_reportLabel()} — ${_scopeLabel()}`], []];
  const f = _filter();
  switch (_repType) {
    case 'pl': {
      const pl = profitAndLoss(_ledger, f);
      rows.push(['REVENUE', '']);
      pl.revenue.forEach(r => rows.push([r.category, r.amount]));
      rows.push(['Total Revenue', pl.totalRevenue], []);
      rows.push(['COST OF SERVICES', '']);
      pl.costOfServices.forEach(r => rows.push([r.category, r.amount]));
      rows.push(['Gross Income', pl.grossIncome], []);
      rows.push(['OPERATING EXPENSES', '']);
      pl.operatingExpenses.forEach(r => rows.push([r.category, r.amount]));
      rows.push(['Total Operating Expenses', pl.totalOperatingExpenses], []);
      rows.push(['NET PROFIT', pl.netProfit]);
      break;
    }
    case 'cashflow': {
      const cf = cashFlowStatement(_ledger, _accounts, f);
      rows.push(['Operating cash in', cf.operatingIn]);
      rows.push(['Operating cash out', cf.operatingOut]);
      rows.push(['Net operating', cf.operatingNet], []);
      rows.push(['Founder capital in', cf.financingIn]);
      rows.push(['Founder withdrawals', cf.financingOut]);
      rows.push(['Net financing', cf.financingNet], []);
      rows.push(['Net change in cash', cf.netChange]);
      rows.push(['Ending cash balance', cf.endingCash]);
      break;
    }
    case 'revenue':
    case 'expense': {
      const cats = _repType === 'revenue'
        ? revenueByCategory(filterEntries(_ledger, f))
        : expenseByCategory(filterEntries(_ledger, f));
      rows.push(['Category', 'Amount']);
      cats.forEach(c => rows.push([c.category, c.amount]));
      rows.push(['TOTAL', cats.reduce((s, c) => s + c.amount, 0)]);
      break;
    }
    case 'project': {
      rows.push(['Project', 'Code', 'Revenue', 'Expenses', 'Net Profit']);
      projectProfitability(_ledger, _projects, f).forEach(r =>
        rows.push([r.name, r.code, r.revenue, r.expenses, r.net]));
      break;
    }
    case 'founder': {
      const eq = founderEquity(_founderCapital);
      rows.push(['Date', 'Ref #', 'Type', 'Amount']);
      [..._founderCapital]
        .sort((a, b) => (b.txn_date ?? '').localeCompare(a.txn_date ?? ''))
        .forEach(fc => rows.push([fc.txn_date ?? '', fc.reference_no ?? '', fc.transaction_type, fc.amount]));
      rows.push([], ['Capital Invested', eq.totalCapital], ['Owner Withdrawals', eq.totalWithdrawals], ['Net Owner Equity', eq.netEquity]);
      break;
    }
    case 'bank': {
      const balances = runningBalanceMap(_ledger, _accounts);
      rows.push(['Date', 'Account', 'Description', 'Cash In', 'Cash Out', 'Balance']);
      [...filterEntries(_ledger, { ...f, projectId: null })]
        .sort((a, b) => (a.txn_date ?? '').localeCompare(b.txn_date ?? '') || a.id - b.id)
        .forEach(e => rows.push([
          e.txn_date ?? '',
          _accounts.find(a => a.id === e.account_id)?.name ?? '',
          e.description, e.cash_in || 0, e.cash_out || 0,
          Number.isNaN(balances.get(e.id) ?? NaN) ? '' : balances.get(e.id)!,
        ]));
      break;
    }
    case 'summary': {
      const s = monthlySummary(_ledger, _founderCapital, f);
      rows.push(['Revenue', s.revenue], ['Expenses', s.expenses], ['Gross Profit', s.grossProfit],
        ['Net Profit', s.netProfit], ['Cash Flow', s.netCashFlow], ['Collections', s.collections],
        ['Payments', s.payments], ['Founder Contributions', s.founderContributions],
        ['Founder Withdrawals', s.founderWithdrawals]);
      break;
    }
  }
  return rows;
}

export function exportFinanceReportCSV(): void {
  try {
    downloadCSV(`${_reportLabel()}-${_scopeLabel()}`.replace(/[^\w-]+/g, '-'), _csvRows());
    toast('CSV exported', 'success');
  } catch (error) {
    console.error('exportFinanceReportCSV failed:', error);
    toast('Could not export CSV', 'error');
  }
}

export function exportFinanceReportExcel(): void {
  try {
    downloadExcel(`${_reportLabel()}-${_scopeLabel()}`.replace(/[^\w-]+/g, '-'), _reportLabel(), _csvRows());
    toast('Excel exported', 'success');
  } catch (error) {
    console.error('exportFinanceReportExcel failed:', error);
    toast('Could not export Excel', 'error');
  }
}

export function printFinanceReport(): void {
  try {
    const body = `<h1>${escapeHtml(_reportLabel())}</h1>
      <div class="meta">Disenyo Digitals Collective · ${escapeHtml(_scopeLabel())}</div>
      ${_printTableFromRows(_csvRows())}`;
    printHTML(`${_reportLabel()} — ${_scopeLabel()}`, body);
  } catch (error) {
    console.error('printFinanceReport failed:', error);
    toast(error instanceof Error ? error.message : 'Could not print report', 'error');
  }
}

// Turn the CSV row model into a simple print table (numbers right-aligned).
function _printTableFromRows(rows: (string | number)[][]): string {
  const body = rows.map(r => {
    if (r.length === 0) return '<tr><td colspan="6" style="border:none;height:8px"></td></tr>';
    if (r.length === 1) return `<tr><td colspan="6" style="font-weight:700;border:none;padding-top:10px">${escapeHtml(String(r[0]))}</td></tr>`;
    return `<tr>${r.map((c, i) => {
      const isNum = typeof c === 'number';
      const val = isNum ? formatCurrency(c) : escapeHtml(String(c));
      return `<td class="${isNum || i > 0 ? 'amt' : ''}">${val}</td>`;
    }).join('')}</tr>`;
  }).join('');
  return `<table>${body}</table>`;
}
