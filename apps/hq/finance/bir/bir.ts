import { formatCurrency } from '@shared/utils/formatUtils.ts';
import { formatDateShort, todayISO } from '@shared/utils/dateUtils.ts';
import { escapeHtml } from '@shared/utils/helpers.ts';
import { validateRequired } from '@shared/utils/validators.ts';
import { displayDate } from '../templates/invoices.ts';
import { APP_SETTINGS } from '@config/settings.ts';
import {
  BIR_PERCENTAGE_TAX_RATE, BIR_8PCT_OPTION_RATE, birMostRecentCompletedQuarter,
  birQuarterLabel, bir2551qDeadline, bir1701qDeadline, bir1604cDeadline,
  birFilingStatus, birGrossReceipts, birExpenses, birCompWithholding,
  bir2307Bills, birIsFiled, birFilingsFor,
} from '@hq/finance/birCalc.ts';
import { createBirFiling } from '@hq/finance/birService.ts';
import { _invoices, _bills, _payroll, _birFilings } from '@hq/core/state.ts';
import { toast, openModal, closeModal } from '@hq/core/ui.ts';
import type { BirFiling, Bill } from '@shared/types.ts';
import { loadFinance } from '../finance.ts';

const gEl  = (id: string) => document.getElementById(id)!;
const gVal = (id: string) => (document.getElementById(id) as HTMLInputElement).value;

function birBadgeClass(status: string) {
  return status === 'Filed'    ? 'paid'
       : status === 'Overdue'  ? 'overdue'
       : status === 'Due Soon' ? 'unpaid'
       : status === 'Ongoing'  ? 'lead'
       : 'lead';
}

function birHistoryLine(form: string) {
  const past = birFilingsFor(_birFilings, form) as BirFiling[];
  if (!past.length) return `<span style="color:var(--ink-3)">No filings recorded yet</span>`;
  const last = past[0];
  return `${escapeHtml(last.period)} — <span style="color:var(--green);font-weight:600">Filed ✓</span>`
       + ` <span style="color:var(--ink-3)">${formatDateShort(String(last.filed_at).slice(0, 10))}`
       + `${past.length > 1 ? ` · ${past.length} total` : ''}</span>`;
}

function birPeriodicCard(form: string, desc: string, period: string, deadlineISO: string | null, baseLabel: string, baseValue: number) {
  const filed  = birIsFiled(_birFilings, form, period);
  const status = birFilingStatus(deadlineISO, filed, new Date());
  const dline  = deadlineISO ? formatDateShort(deadlineISO) : '—';
  return `
    <div class="bir-card">
      <div class="bir-form-name">${form}</div>
      <div class="bir-form-desc">${desc}</div>
      <div class="flex-between">
        <div class="bir-deadline">${escapeHtml(period)} deadline: <strong>${dline}</strong></div>
        <span class="badge badge-${birBadgeClass(status)}">${status}</span>
      </div>
      <div style="margin-top:8px;font-size:11px;color:var(--ink-2)">${escapeHtml(baseLabel)}: <strong>${formatCurrency(baseValue)}</strong></div>
      <div style="margin-top:10px;font-size:11px;color:var(--ink-3)">${birHistoryLine(form)}</div>
      ${filed ? '' : `<button class="btn btn-primary" style="margin-top:12px;width:100%" onclick="openFileBir('${form}')">Save Filing Record</button>`}
    </div>`;
}

export function renderBIR() {
  const today = new Date();
  const { q, year } = birMostRecentCompletedQuarter(today);
  const period = birQuarterLabel(q, year);

  const receipts = birGrossReceipts(_invoices, q, year);
  const expenses = birExpenses(_bills, q, year);
  const netInc   = Math.max(0, receipts - expenses);
  const withheld = birCompWithholding(_payroll, APP_SETTINGS.finance.birYear);

  const twoThreeOhSeven = bir2307Bills(_bills) as Bill[];
  const last2307 = twoThreeOhSeven
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];

  gEl('bir-cards').innerHTML = `
    ${birPeriodicCard('2551Q', 'Quarterly Percentage Tax Return<br>Non-VAT · 3% of gross receipts',
        period, bir2551qDeadline(q, year), 'Gross receipts this quarter', receipts)}
    ${birPeriodicCard('1701Q', 'Quarterly Income Tax Return<br>For self-employed / OPC founders',
        period, bir1701qDeadline(q, year), 'Net income this quarter', netInc)}
    ${birPeriodicCard('1604C', 'Annual Information Return — Income Taxes Withheld on Compensation',
        `FY ${APP_SETTINGS.finance.birYear}`, bir1604cDeadline(APP_SETTINGS.finance.birYear),
        'Compensation withheld YTD', withheld)}
    <div class="bir-card">
      <div class="bir-form-name">2307</div>
      <div class="bir-form-desc">Certificate of Creditable Tax Withheld at Source — issue to payees per transaction</div>
      <div class="flex-between">
        <div class="bir-deadline">${twoThreeOhSeven.length} bill${twoThreeOhSeven.length !== 1 ? 's' : ''} with EWT to certify</div>
        <span class="badge badge-lead">Ongoing</span>
      </div>
      <div style="margin-top:10px;font-size:11px;color:var(--ink-3)">Last EWT bill: <span style="color:var(--ink);font-weight:600">${last2307 ? formatDateShort(String(last2307.date).slice(0, 10)) : '—'}</span></div>
    </div>`;
}

export function openFileBir(form: string) {
  const today  = new Date();
  const { q, year } = birMostRecentCompletedQuarter(today);
  const birYear = APP_SETTINGS.finance.birYear;

  let period: string, base: number, suggestedTax: number, baseLabel: string, note: string;
  if (form === '2551Q') {
    period = birQuarterLabel(q, year);
    base = birGrossReceipts(_invoices, q, year);
    suggestedTax = Math.round(base * BIR_PERCENTAGE_TAX_RATE * 100) / 100;
    baseLabel = 'Gross receipts (₱)';
    note = '3% percentage tax pre-filled from paid invoices this quarter.';
  } else if (form === '1701Q') {
    period = birQuarterLabel(q, year);
    base = Math.max(0, birGrossReceipts(_invoices, q, year) - birExpenses(_bills, q, year));
    suggestedTax = Math.round(birGrossReceipts(_invoices, q, year) * BIR_8PCT_OPTION_RATE * 100) / 100;
    baseLabel = 'Net income (₱)';
    note = '8% option pre-filled on gross receipts — verify against your accountant (graduated rates may apply).';
  } else {
    period = `FY ${birYear}`;
    base = birCompWithholding(_payroll, birYear);
    suggestedTax = base;
    baseLabel = 'Compensation withheld (₱)';
    note = 'Total withholding on compensation from payroll runs this year.';
  }

  openModal(`File ${form} — ${period}`, `
    <div class="form-grid">
      <div class="form-group"><div class="form-label">Form</div><input class="form-input" id="bir-form" value="${form}" readonly/></div>
      <div class="form-group"><div class="form-label">Period</div><input class="form-input" id="bir-period" value="${escapeHtml(period)}"/></div>
      <div class="form-group"><div class="form-label">${baseLabel}</div><input class="form-input" id="bir-base" type="number" value="${base}"/></div>
      <div class="form-group"><div class="form-label">Tax Due / Paid (₱)</div><input class="form-input" id="bir-tax" type="number" value="${suggestedTax}"/></div>
      <div class="form-group"><div class="form-label">Filed Date</div><input class="form-input" id="bir-date" type="date" value="${todayISO()}"/></div>
      <div class="form-group"><div class="form-label">BIR Reference No.</div><input class="form-input" id="bir-ref" placeholder="eFPS / confirmation no."/></div>
      <div class="form-group full"><div class="form-label">Notes</div><textarea class="form-input" id="bir-notes" rows="2" placeholder="Optional"></textarea></div>
    </div>
    <div style="font-size:10.5px;color:var(--ink-3);margin-top:10px;line-height:1.6">${note}</div>`, saveBirFiling);
}

export async function saveBirFiling() {
  const form   = gVal('bir-form').trim();
  const period = gVal('bir-period').trim();
  const err = validateRequired(period, 'Period');
  if (err) { toast(err, 'error'); return; }
  const result = await createBirFiling({
    form,
    period,
    tax_base:     +gVal('bir-base')  || 0,
    tax_due:      +gVal('bir-tax')   || 0,
    reference_no: gVal('bir-ref').trim(),
    notes:        gVal('bir-notes').trim(),
    filed_at:     gVal('bir-date') || todayISO(),
  });
  if (!result) { toast('Could not record BIR filing. Please try again.', 'error'); return; }
  toast(`${form} filing recorded for ${period}`, 'success');
  closeModal();
  loadFinance();
}

// ── BIR Tab Switcher ──────────────────────────────────────────────────────────

export function showBIRTab(name: string, el: HTMLElement) {
  document.querySelectorAll('#bir-subtabs .sub-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const tracker = document.getElementById('bir-panel-tracker');
  const reports  = document.getElementById('bir-panel-reports');
  if (tracker) tracker.style.display = name === 'tracker' ? '' : 'none';
  if (reports)  reports.style.display = name === 'reports'  ? '' : 'none';
  if (name === 'reports') renderBIRReports();
}

// ── BIR Reports ───────────────────────────────────────────────────────────────

type BIRReportState = {
  period:  'monthly' | 'quarterly' | 'annual';
  year:    number;
  month:   number;
  quarter: number;
};

let _birReport: BIRReportState = {
  period:  'monthly',
  year:    new Date().getFullYear(),
  month:   new Date().getMonth() + 1,
  quarter: Math.ceil((new Date().getMonth() + 1) / 3),
};

export function setBIRReportPeriod(val: string) {
  _birReport = { ..._birReport, period: val as BIRReportState['period'] };
  renderBIRReports();
}

export function setBIRReportYear(val: string) {
  _birReport = { ..._birReport, year: +val || new Date().getFullYear() };
  renderBIRReports();
}

export function setBIRReportMonth(val: string) {
  _birReport = { ..._birReport, month: +val || 1 };
  renderBIRReports();
}

export function setBIRReportQuarter(val: string) {
  _birReport = { ..._birReport, quarter: +val || 1 };
  renderBIRReports();
}

function _birReportInvoices() {
  const paid = _invoices.filter(i => i.status === 'Paid' && !i.archived_at);
  const year = _birReport.year;
  if (_birReport.period === 'annual') {
    return paid.filter(i => (i.payment_date ?? i.date ?? '').slice(0, 4) === String(year));
  }
  if (_birReport.period === 'quarterly') {
    const qMonths = [1, 2, 3].map(m => m + (_birReport.quarter - 1) * 3);
    return paid.filter(i => {
      const d = i.payment_date ?? i.date ?? '';
      return d.slice(0, 4) === String(year) && qMonths.includes(+d.slice(5, 7));
    });
  }
  const mm = String(_birReport.month).padStart(2, '0');
  return paid.filter(i => (i.payment_date ?? i.date ?? '').slice(0, 7) === `${year}-${mm}`);
}

function _birReportBills() {
  const paid = _bills.filter(b => b.status === 'Paid' && !b.archived_at);
  const year = _birReport.year;
  if (_birReport.period === 'annual') {
    return paid.filter(b => (b.date ?? '').slice(0, 4) === String(year));
  }
  if (_birReport.period === 'quarterly') {
    const qMonths = [1, 2, 3].map(m => m + (_birReport.quarter - 1) * 3);
    return paid.filter(b => {
      const d = b.date ?? '';
      return d.slice(0, 4) === String(year) && qMonths.includes(+d.slice(5, 7));
    });
  }
  const mm = String(_birReport.month).padStart(2, '0');
  return paid.filter(b => (b.date ?? '').slice(0, 7) === `${year}-${mm}`);
}

function _periodLabel() {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (_birReport.period === 'annual')   return `FY ${_birReport.year}`;
  if (_birReport.period === 'quarterly') return `Q${_birReport.quarter} ${_birReport.year}`;
  return `${MONTHS[_birReport.month - 1]} ${_birReport.year}`;
}

export function renderBIRReports() {
  const el = document.getElementById('bir-reports-content');
  if (!el) return;

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const curYear = new Date().getFullYear();
  const yearOpts = Array.from({ length: 5 }, (_, i) => curYear - i)
    .map(y => `<option value="${y}"${y === _birReport.year ? ' selected' : ''}>${y}</option>`).join('');
  const monthOpts = MONTHS.map((m, i) =>
    `<option value="${i + 1}"${i + 1 === _birReport.month ? ' selected' : ''}>${m}</option>`).join('');
  const qOpts = [1,2,3,4].map(q =>
    `<option value="${q}"${q === _birReport.quarter ? ' selected' : ''}>Q${q}</option>`).join('');

  const invs  = _birReportInvoices();
  const bills = _birReportBills();

  const totalRevenue  = invs.reduce((s, i) => s + (i.amount || 0), 0);
  const totalExpenses = bills.reduce((s, b) => s + (b.amount || 0), 0);
  const netIncome     = totalRevenue - totalExpenses;

  // Revenue by client
  const byClient: Record<string, number> = {};
  invs.forEach(i => { byClient[i.client ?? 'Unknown'] = (byClient[i.client ?? 'Unknown'] || 0) + (i.amount || 0); });
  const clientRows = Object.entries(byClient).sort((a, b) => b[1] - a[1]);

  // Expenses by category
  const byCat: Record<string, number> = {};
  bills.forEach(b => { byCat[b.category ?? 'Uncategorized'] = (byCat[b.category ?? 'Uncategorized'] || 0) + (b.amount || 0); });
  const catRows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  // VAT Summary — Output VAT (12% on gross receipts) vs Input VAT (EWT withheld on bills)
  const outputVat  = Math.round(totalRevenue / 1.12 * 0.12 * 100) / 100;
  const inputEwt   = bills.reduce((s, b) => {
    const rate = parseFloat((b.ewt ?? '0%').replace('%', '')) / 100;
    return s + Math.round(b.amount * rate * 100) / 100;
  }, 0);
  const vatPayable = outputVat - inputEwt;

  // Monthly breakdown (last 6 months for annual/quarterly views, or just current month)
  const last6 = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(curYear, new Date().getMonth() - (5 - i), 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: MONTHS[d.getMonth()] };
  });
  const revByMonth = Object.fromEntries(last6.map(m => [m.key, 0]));
  const expByMonth = Object.fromEntries(last6.map(m => [m.key, 0]));
  _invoices.filter(i => i.status === 'Paid').forEach(i => {
    const k = (i.payment_date ?? i.date ?? '').slice(0, 7);
    if (k in revByMonth) revByMonth[k] += i.amount || 0;
  });
  _bills.filter(b => b.status === 'Paid').forEach(b => {
    const k = (b.date ?? '').slice(0, 7);
    if (k in expByMonth) expByMonth[k] += b.amount || 0;
  });
  const maxBar = Math.max(...last6.map(m => Math.max(revByMonth[m.key], expByMonth[m.key])), 1);

  el.innerHTML = `
    <!-- Period Selector -->
    <div class="card" style="padding:14px 16px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3)">Period</div>
        <select class="form-input" style="width:auto;padding:4px 10px;height:30px;font-size:12px" onchange="setBIRReportPeriod(this.value)">
          <option value="monthly"${_birReport.period==='monthly' ? ' selected' : ''}>Monthly</option>
          <option value="quarterly"${_birReport.period==='quarterly' ? ' selected' : ''}>Quarterly</option>
          <option value="annual"${_birReport.period==='annual' ? ' selected' : ''}>Annual</option>
        </select>
        <select class="form-input" style="width:auto;padding:4px 10px;height:30px;font-size:12px" onchange="setBIRReportYear(this.value)">${yearOpts}</select>
        ${_birReport.period === 'monthly'   ? `<select class="form-input" style="width:auto;padding:4px 10px;height:30px;font-size:12px" onchange="setBIRReportMonth(this.value)">${monthOpts}</select>` : ''}
        ${_birReport.period === 'quarterly' ? `<select class="form-input" style="width:auto;padding:4px 10px;height:30px;font-size:12px" onchange="setBIRReportQuarter(this.value)">${qOpts}</select>` : ''}
        <div style="margin-left:auto;display:flex;gap:8px">
          <button class="btn btn-ghost" style="font-size:11px;padding:4px 12px" onclick="printBIRReport()">Print / PDF</button>
          <button class="btn btn-ghost" style="font-size:11px;padding:4px 12px" onclick="exportBIRReportExcel()">Export Excel</button>
          <button class="btn btn-ghost" style="font-size:11px;padding:4px 12px" onclick="exportBIRReportCSV()">Export CSV</button>
        </div>
      </div>
    </div>

    <!-- Summary Cards -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">Total Revenue</div>
        <div class="stat-value" style="font-size:20px;color:var(--green)">${formatCurrency(totalRevenue)}</div>
        <div class="stat-change up">${invs.length} paid invoice${invs.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Expenses</div>
        <div class="stat-value" style="font-size:20px;color:var(--red)">${formatCurrency(totalExpenses)}</div>
        <div class="stat-change">${bills.length} expense${bills.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Net Income</div>
        <div class="stat-value" style="font-size:20px;${netIncome < 0 ? 'color:var(--red)' : 'color:var(--green)'}">${formatCurrency(Math.abs(netIncome))}</div>
        <div class="stat-change ${netIncome >= 0 ? 'up' : ''}">${netIncome >= 0 ? 'Profitable' : 'Operating at a loss'} · ${_periodLabel()}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      <!-- Revenue Summary -->
      <div class="card" style="padding:16px">
        <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:12px">Revenue Summary — ${_periodLabel()}</div>
        ${invs.length === 0
          ? '<div style="font-size:12px;color:var(--ink-3)">No paid invoices in this period</div>'
          : `<table style="width:100%;border-collapse:collapse;font-size:12px">
              <thead><tr>
                <th style="text-align:left;padding:4px 0;color:var(--ink-3);font-weight:600;border-bottom:1px solid var(--linen-3)">Date</th>
                <th style="text-align:left;padding:4px 0;color:var(--ink-3);font-weight:600;border-bottom:1px solid var(--linen-3)">Client</th>
                <th style="text-align:right;padding:4px 0;color:var(--ink-3);font-weight:600;border-bottom:1px solid var(--linen-3)">Amount</th>
              </tr></thead>
              <tbody>${invs.slice(0, 10).map(i => `
                <tr>
                  <td style="padding:5px 0;color:var(--ink-3)">${displayDate(i.payment_date ?? i.date)}</td>
                  <td style="padding:5px 0">${escapeHtml(i.client ?? '—')}</td>
                  <td style="padding:5px 0;text-align:right;font-family:'Cormorant Garamond',serif;font-weight:600">${formatCurrency(i.amount)}</td>
                </tr>`).join('')}
              </tbody>
              <tfoot><tr>
                <td colspan="2" style="padding:6px 0;font-weight:600;border-top:1px solid var(--linen-3)">Total${invs.length > 10 ? ` (${invs.length} invoices)` : ''}</td>
                <td style="padding:6px 0;text-align:right;font-family:'Cormorant Garamond',serif;font-weight:700;border-top:1px solid var(--linen-3);color:var(--green)">${formatCurrency(totalRevenue)}</td>
              </tr></tfoot>
            </table>`}
      </div>

      <!-- Expense Summary -->
      <div class="card" style="padding:16px">
        <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:12px">Expense Summary — ${_periodLabel()}</div>
        ${catRows.length === 0
          ? '<div style="font-size:12px;color:var(--ink-3)">No expenses in this period</div>'
          : `<table style="width:100%;border-collapse:collapse;font-size:12px">
              <thead><tr>
                <th style="text-align:left;padding:4px 0;color:var(--ink-3);font-weight:600;border-bottom:1px solid var(--linen-3)">Category</th>
                <th style="text-align:right;padding:4px 0;color:var(--ink-3);font-weight:600;border-bottom:1px solid var(--linen-3)">Amount</th>
                <th style="text-align:right;padding:4px 0;color:var(--ink-3);font-weight:600;border-bottom:1px solid var(--linen-3)">%</th>
              </tr></thead>
              <tbody>${catRows.map(([cat, amt]) => `
                <tr>
                  <td style="padding:5px 0">${escapeHtml(cat)}</td>
                  <td style="padding:5px 0;text-align:right;font-family:'Cormorant Garamond',serif;font-weight:600">${formatCurrency(amt)}</td>
                  <td style="padding:5px 0;text-align:right;color:var(--ink-3)">${totalExpenses > 0 ? Math.round(amt / totalExpenses * 100) : 0}%</td>
                </tr>`).join('')}
              </tbody>
              <tfoot><tr>
                <td style="padding:6px 0;font-weight:600;border-top:1px solid var(--linen-3)">Total</td>
                <td style="padding:6px 0;text-align:right;font-family:'Cormorant Garamond',serif;font-weight:700;border-top:1px solid var(--linen-3);color:var(--red)">${formatCurrency(totalExpenses)}</td>
                <td style="border-top:1px solid var(--linen-3)"></td>
              </tr></tfoot>
            </table>`}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      <!-- Sales Report -->
      <div class="card" style="padding:16px">
        <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:12px">Sales Report by Client — ${_periodLabel()}</div>
        ${clientRows.length === 0
          ? '<div style="font-size:12px;color:var(--ink-3)">No sales in this period</div>'
          : `<table style="width:100%;border-collapse:collapse;font-size:12px">
              <thead><tr>
                <th style="text-align:left;padding:4px 0;color:var(--ink-3);font-weight:600;border-bottom:1px solid var(--linen-3)">Client</th>
                <th style="text-align:right;padding:4px 0;color:var(--ink-3);font-weight:600;border-bottom:1px solid var(--linen-3)">Revenue</th>
                <th style="text-align:right;padding:4px 0;color:var(--ink-3);font-weight:600;border-bottom:1px solid var(--linen-3)">Share</th>
              </tr></thead>
              <tbody>${clientRows.map(([client, amt]) => `
                <tr>
                  <td style="padding:5px 0">${escapeHtml(client)}</td>
                  <td style="padding:5px 0;text-align:right;font-family:'Cormorant Garamond',serif;font-weight:600">${formatCurrency(amt)}</td>
                  <td style="padding:5px 0;text-align:right;color:var(--ink-3)">${totalRevenue > 0 ? Math.round(amt / totalRevenue * 100) : 0}%</td>
                </tr>`).join('')}
              </tbody>
              <tfoot><tr>
                <td style="padding:6px 0;font-weight:600;border-top:1px solid var(--linen-3)">Total</td>
                <td style="padding:6px 0;text-align:right;font-family:'Cormorant Garamond',serif;font-weight:700;border-top:1px solid var(--linen-3);color:var(--green)">${formatCurrency(totalRevenue)}</td>
                <td style="border-top:1px solid var(--linen-3)"></td>
              </tr></tfoot>
            </table>`}
      </div>

      <!-- VAT Summary -->
      <div class="card" style="padding:16px">
        <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:12px">VAT / Tax Summary — ${_periodLabel()}</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <tbody>
            <tr style="border-bottom:1px solid var(--linen-3)">
              <td style="padding:8px 0;color:var(--ink-2)">Gross Receipts (Revenue)</td>
              <td style="padding:8px 0;text-align:right;font-family:'Cormorant Garamond',serif;font-weight:600">${formatCurrency(totalRevenue)}</td>
            </tr>
            <tr style="border-bottom:1px solid var(--linen-3)">
              <td style="padding:8px 0;color:var(--ink-2)">Output VAT (12% on gross)</td>
              <td style="padding:8px 0;text-align:right;font-family:'Cormorant Garamond',serif;font-weight:600;color:var(--amber)">${formatCurrency(outputVat)}</td>
            </tr>
            <tr style="border-bottom:1px solid var(--linen-3)">
              <td style="padding:8px 0;color:var(--ink-2)">Total Expenses</td>
              <td style="padding:8px 0;text-align:right;font-family:'Cormorant Garamond',serif;font-weight:600">${formatCurrency(totalExpenses)}</td>
            </tr>
            <tr style="border-bottom:1px solid var(--linen-3)">
              <td style="padding:8px 0;color:var(--ink-2)">Input Tax / EWT Withheld</td>
              <td style="padding:8px 0;text-align:right;font-family:'Cormorant Garamond',serif;font-weight:600;color:var(--green)">− ${formatCurrency(inputEwt)}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;font-weight:700">Net VAT Payable</td>
              <td style="padding:10px 0;text-align:right;font-family:'Cormorant Garamond',serif;font-weight:700;font-size:16px;${vatPayable > 0 ? 'color:var(--red)' : 'color:var(--green)'}">${formatCurrency(Math.abs(vatPayable))}</td>
            </tr>
          </tbody>
        </table>
        <div style="margin-top:12px;font-size:10.5px;color:var(--ink-3);line-height:1.6">
          Output VAT computed at 12% of gross receipts. Input tax reflects EWT withheld on expense vouchers. Consult your accountant for BIR filing.
        </div>
      </div>
    </div>

    <!-- Monthly Trend (last 6 months) -->
    <div class="card" style="padding:16px;margin-bottom:16px">
      <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:12px">Revenue vs Expenses — Last 6 Months</div>
      <div style="display:flex;align-items:flex-end;gap:8px;height:90px">
        ${last6.map(m => `
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">
            <div style="display:flex;align-items:flex-end;gap:3px;height:72px">
              <div title="Revenue ${formatCurrency(revByMonth[m.key])}" style="width:12px;background:var(--gold);height:${Math.max(2, Math.round(revByMonth[m.key] / maxBar * 72))}px;border-radius:2px 2px 0 0"></div>
              <div title="Expenses ${formatCurrency(expByMonth[m.key])}" style="width:12px;background:var(--linen-3);height:${Math.max(2, Math.round(expByMonth[m.key] / maxBar * 72))}px;border-radius:2px 2px 0 0"></div>
            </div>
            <div style="font-size:9px;color:var(--ink-3)">${m.label}</div>
          </div>`).join('')}
      </div>
      <div style="display:flex;gap:12px;margin-top:8px">
        <div style="display:flex;align-items:center;gap:4px"><div style="width:8px;height:8px;background:var(--gold);border-radius:2px"></div><span style="font-size:10px;color:var(--ink-3)">Revenue</span></div>
        <div style="display:flex;align-items:center;gap:4px"><div style="width:8px;height:8px;background:var(--linen-3);border-radius:2px"></div><span style="font-size:10px;color:var(--ink-3)">Expenses</span></div>
      </div>
    </div>`;
}

// ── BIR Report Exports ────────────────────────────────────────────────────────

export function printBIRReport() {
  const company = APP_SETTINGS.company;
  const invs    = _birReportInvoices();
  const bills   = _birReportBills();
  const period  = _periodLabel();

  const totalRevenue  = invs.reduce((s, i)  => s + (i.amount || 0), 0);
  const totalExpenses = bills.reduce((s, b) => s + (b.amount || 0), 0);
  const netIncome     = totalRevenue - totalExpenses;
  const outputVat     = Math.round(totalRevenue / 1.12 * 0.12 * 100) / 100;
  const inputEwt      = bills.reduce((s, b) => {
    const rate = parseFloat((b.ewt ?? '0%').replace('%', '')) / 100;
    return s + Math.round(b.amount * rate * 100) / 100;
  }, 0);

  const byClient: Record<string, number> = {};
  invs.forEach(i => { byClient[i.client ?? 'Unknown'] = (byClient[i.client ?? 'Unknown'] || 0) + (i.amount || 0); });
  const byCat: Record<string, number> = {};
  bills.forEach(b => { byCat[b.category ?? 'Uncategorized'] = (byCat[b.category ?? 'Uncategorized'] || 0) + (b.amount || 0); });

  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) { toast('Pop-up blocked — allow pop-ups and try again', 'error'); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>BIR Report — ${escapeHtml(period)}</title>
<style>
  body{font-family:Georgia,serif;font-size:13px;color:#1a1a1a;padding:40px;max-width:800px;margin:0 auto}
  h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;font-weight:700;margin:24px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px}
  th{text-align:left;padding:5px 6px;border-bottom:2px solid #1a1a1a;font-size:11px;letter-spacing:.05em}
  td{padding:5px 6px;border-bottom:1px solid #eee}
  .right{text-align:right}.total{font-weight:700;border-top:2px solid #1a1a1a}
  .summary{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:24px}
  .card{border:1px solid #ddd;padding:12px;border-radius:4px}.label{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#666}
  .value{font-size:20px;font-weight:700;margin-top:4px}
  @media print{button{display:none}}
</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px">
  <div>
    <h1>${escapeHtml(company.name)}</h1>
    <div style="font-size:11px;color:#666">${escapeHtml(company.address ?? '')} · TIN: ${escapeHtml((APP_SETTINGS as any).tin ?? '—')}</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:18px;font-weight:700">BIR Financial Report</div>
    <div style="font-size:13px;color:#666">${escapeHtml(period)}</div>
    <div style="font-size:11px;color:#999">Generated ${new Date().toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric'})}</div>
  </div>
</div>

<div class="summary">
  <div class="card"><div class="label">Total Revenue</div><div class="value" style="color:#1a6b3c">${formatCurrency(totalRevenue)}</div></div>
  <div class="card"><div class="label">Total Expenses</div><div class="value" style="color:#c0392b">${formatCurrency(totalExpenses)}</div></div>
  <div class="card"><div class="label">Net Income</div><div class="value" style="${netIncome<0?'color:#c0392b':'color:#1a6b3c'}">${formatCurrency(Math.abs(netIncome))}</div></div>
</div>

<h2>Revenue Summary</h2>
<table><thead><tr><th>Date</th><th>Client</th><th>Invoice #</th><th class="right">Amount</th></tr></thead>
<tbody>${invs.map(i => `<tr><td>${displayDate(i.payment_date ?? i.date)}</td><td>${escapeHtml(i.client ?? '—')}</td><td>${escapeHtml(i.or_num ?? '—')}</td><td class="right">${formatCurrency(i.amount)}</td></tr>`).join('')}</tbody>
<tfoot><tr class="total"><td colspan="3">Total Revenue</td><td class="right">${formatCurrency(totalRevenue)}</td></tr></tfoot>
</table>

<h2>Expense Summary by Category</h2>
<table><thead><tr><th>Category</th><th class="right">Amount</th><th class="right">%</th></tr></thead>
<tbody>${Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>`<tr><td>${escapeHtml(cat)}</td><td class="right">${formatCurrency(amt)}</td><td class="right">${totalExpenses>0?Math.round(amt/totalExpenses*100):0}%</td></tr>`).join('')}</tbody>
<tfoot><tr class="total"><td>Total Expenses</td><td class="right">${formatCurrency(totalExpenses)}</td><td></td></tr></tfoot>
</table>

<h2>Sales Report by Client</h2>
<table><thead><tr><th>Client</th><th class="right">Revenue</th><th class="right">Share</th></tr></thead>
<tbody>${Object.entries(byClient).sort((a,b)=>b[1]-a[1]).map(([client,amt])=>`<tr><td>${escapeHtml(client)}</td><td class="right">${formatCurrency(amt)}</td><td class="right">${totalRevenue>0?Math.round(amt/totalRevenue*100):0}%</td></tr>`).join('')}</tbody>
<tfoot><tr class="total"><td>Total</td><td class="right">${formatCurrency(totalRevenue)}</td><td></td></tr></tfoot>
</table>

<h2>VAT / Tax Summary</h2>
<table><tbody>
  <tr><td>Gross Receipts</td><td class="right">${formatCurrency(totalRevenue)}</td></tr>
  <tr><td>Output VAT (12%)</td><td class="right">${formatCurrency(outputVat)}</td></tr>
  <tr><td>Input Tax / EWT Withheld</td><td class="right">− ${formatCurrency(inputEwt)}</td></tr>
  <tr class="total"><td>Net VAT Payable</td><td class="right">${formatCurrency(Math.abs(outputVat - inputEwt))}</td></tr>
</tbody></table>

<div style="margin-top:40px;font-size:10px;color:#999;border-top:1px solid #eee;padding-top:12px">
  This report is for internal reference only. Consult your accountant before filing with BIR. Generated by DestineVents HQ.
</div>
<div style="margin-top:20px;text-align:center"><button onclick="window.print()" style="background:#252f27;color:#fff;border:none;padding:8px 24px;font-size:12px;cursor:pointer;font-family:inherit">Print / Save as PDF</button></div>
</body></html>`);
  w.document.close();
}

export function exportBIRReportCSV() {
  const invs  = _birReportInvoices();
  const bills = _birReportBills();
  const period = _periodLabel();

  const rows: string[][] = [];

  rows.push([`BIR Financial Report — ${period}`]);
  rows.push([]);
  rows.push(['=== REVENUE SUMMARY ===']);
  rows.push(['Date', 'Client', 'Invoice #', 'Amount']);
  invs.forEach(i => rows.push([
    String(i.payment_date ?? i.date ?? ''),
    String(i.client ?? ''),
    String(i.or_num ?? ''),
    String(i.amount ?? 0),
  ]));
  rows.push(['', '', 'TOTAL REVENUE', String(invs.reduce((s, i) => s + (i.amount || 0), 0))]);

  rows.push([]);
  rows.push(['=== EXPENSE SUMMARY ===']);
  rows.push(['Date', 'Vendor', 'Category', 'Amount', 'EWT Rate']);
  bills.forEach(b => rows.push([
    String(b.date ?? ''),
    String(b.vendor ?? b.payee ?? ''),
    String(b.category ?? ''),
    String(b.amount ?? 0),
    String(b.ewt ?? '0%'),
  ]));
  rows.push(['', '', '', 'TOTAL EXPENSES', String(bills.reduce((s, b) => s + (b.amount || 0), 0))]);

  rows.push([]);
  rows.push(['=== VAT SUMMARY ===']);
  const rev = invs.reduce((s, i) => s + (i.amount || 0), 0);
  const ewt = bills.reduce((s, b) => {
    const rate = parseFloat((b.ewt ?? '0%').replace('%', '')) / 100;
    return s + Math.round(b.amount * rate * 100) / 100;
  }, 0);
  rows.push(['Gross Receipts', String(rev)]);
  rows.push(['Output VAT (12%)', String(Math.round(rev / 1.12 * 0.12 * 100) / 100)]);
  rows.push(['Input Tax / EWT', String(ewt)]);
  rows.push(['Net VAT Payable', String(Math.round((rev / 1.12 * 0.12 - ewt) * 100) / 100)]);

  const csv   = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob  = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href      = url;
  a.download  = `BIR-Report-${period.replace(/\s/g, '-')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('CSV exported', 'success');
}

export function exportBIRReportExcel() {
  const invs   = _birReportInvoices();
  const bills  = _birReportBills();
  const period = _periodLabel();

  const totalRevenue  = invs.reduce((s, i) => s + (i.amount || 0), 0);
  const totalExpenses = bills.reduce((s, b) => s + (b.amount || 0), 0);
  const netIncome     = totalRevenue - totalExpenses;
  const outputVat     = Math.round(totalRevenue / 1.12 * 0.12 * 100) / 100;
  const inputEwt      = bills.reduce((s, b) => {
    const rate = parseFloat((b.ewt ?? '0%').replace('%', '')) / 100;
    return s + Math.round(b.amount * rate * 100) / 100;
  }, 0);
  const byCat: Record<string, number> = {};
  bills.forEach(b => { byCat[b.category ?? 'Uncategorized'] = (byCat[b.category ?? 'Uncategorized'] || 0) + (b.amount || 0); });
  const byClient: Record<string, number> = {};
  invs.forEach(i => { byClient[i.client ?? 'Unknown'] = (byClient[i.client ?? 'Unknown'] || 0) + (i.amount || 0); });

  const cell = (v: string | number, bold = false, right = false) =>
    `<td style="${bold ? 'font-weight:700;' : ''}${right ? 'text-align:right;mso-number-format:"#,##0.00";' : ''}">${escapeHtml(String(v))}</td>`;
  const th = (v: string) => `<th style="background:#f5f0e8;font-weight:700;border:1px solid #ccc;padding:4px 8px">${escapeHtml(v)}</th>`;
  const tr = (...cells: string[]) => `<tr style="border:1px solid #ddd">${cells.join('')}</tr>`;
  const heading = (v: string) =>
    `<tr><td colspan="4" style="background:#252f27;color:#fff;font-weight:700;font-size:13px;padding:6px 8px">${escapeHtml(v)}</td></tr>`;

  const html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8"/>
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>
  <x:ExcelWorksheet><x:Name>BIR Report</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet>
</x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
</head><body>
<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;font-family:Arial;font-size:12px">
  <tr><td colspan="4" style="font-size:16px;font-weight:700;padding:8px">BIR Financial Report — ${escapeHtml(period)}</td></tr>
  <tr><td colspan="4" style="color:#666;font-size:11px">${escapeHtml(APP_SETTINGS.company.name)}</td></tr>
  <tr></tr>

  <!-- Summary -->
  ${heading('SUMMARY')}
  ${tr(cell('Total Revenue', true), cell(totalRevenue, false, true))}
  ${tr(cell('Total Expenses', true), cell(totalExpenses, false, true))}
  ${tr(cell('Net Income', true), cell(netIncome, true, true))}
  <tr></tr>

  <!-- Revenue Summary -->
  ${heading('REVENUE SUMMARY')}
  <tr>${th('Date')}${th('Client')}${th('Invoice #')}${th('Amount')}</tr>
  ${invs.map(i => tr(cell(String(i.payment_date ?? i.date ?? '')), cell(i.client ?? '—'), cell(i.or_num ?? '—'), cell(i.amount ?? 0, false, true))).join('')}
  ${tr(cell('TOTAL REVENUE', true), cell(''), cell(''), cell(totalRevenue, true, true))}
  <tr></tr>

  <!-- Expense Summary -->
  ${heading('EXPENSE SUMMARY BY CATEGORY')}
  <tr>${th('Category')}${th('Amount')}${th('%')}${th('')}</tr>
  ${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([cat, amt]) =>
    tr(cell(cat), cell(amt, false, true), cell(`${totalExpenses > 0 ? Math.round(amt / totalExpenses * 100) : 0}%`), cell(''))).join('')}
  ${tr(cell('TOTAL EXPENSES', true), cell(totalExpenses, true, true), cell(''), cell(''))}
  <tr></tr>

  <!-- Sales Report -->
  ${heading('SALES REPORT BY CLIENT')}
  <tr>${th('Client')}${th('Revenue')}${th('%')}${th('')}</tr>
  ${Object.entries(byClient).sort((a, b) => b[1] - a[1]).map(([client, amt]) =>
    tr(cell(client), cell(amt, false, true), cell(`${totalRevenue > 0 ? Math.round(amt / totalRevenue * 100) : 0}%`), cell(''))).join('')}
  ${tr(cell('TOTAL', true), cell(totalRevenue, true, true), cell(''), cell(''))}
  <tr></tr>

  <!-- VAT Summary -->
  ${heading('VAT / TAX SUMMARY')}
  ${tr(cell('Gross Receipts'), cell(totalRevenue, false, true))}
  ${tr(cell('Output VAT (12%)'), cell(outputVat, false, true))}
  ${tr(cell('Input Tax / EWT Withheld'), cell(inputEwt, false, true))}
  ${tr(cell('Net VAT Payable', true), cell(Math.abs(outputVat - inputEwt), true, true))}
</table>
</body></html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `BIR-Report-${period.replace(/\s/g, '-')}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Excel file exported', 'success');
}
