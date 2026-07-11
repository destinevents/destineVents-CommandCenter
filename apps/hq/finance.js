import { formatCurrency } from '../../shared/utils/formatUtils.ts';
import { formatDateShort, todayISO } from '../../shared/utils/dateUtils.ts';
import { escapeHtml, statusClass } from '../../shared/utils/helpers.ts';
import { validateRequired } from '../../shared/utils/validators.ts';
import { APP_SETTINGS } from '../../config/settings.js';
import {
  fetchInvoices, createInvoice, updateInvoice, deleteInvoice,
  fetchBills, createBill, updateBill, deleteBill,
  fetchPayrollRuns, createPayrollRun, updatePayrollRun, deletePayrollRun,
  calcFinanceSummary,
} from '../../shared/services/financeService.js';
import { fetchBirFilings, createBirFiling } from '../../shared/services/birService.js';
import {
  BIR_PERCENTAGE_TAX_RATE, BIR_8PCT_OPTION_RATE, birMostRecentCompletedQuarter,
  birQuarterLabel, bir2551qDeadline, bir1701qDeadline, bir1604cDeadline,
  birFilingStatus, birGrossReceipts, birExpenses, birCompWithholding,
  bir2307Bills, birIsFiled, birFilingsFor,
} from '../../shared/business/birCalc.js';
import { _invoices, _bills, _payroll, _birFilings, setInvoices, setBills, setPayroll, setBirFilings } from './state.js';
import { toast, openModal, closeModal } from './ui.js';

let _editingInvoiceId = null;
let _editingBillId    = null;
let _editingPayrollId = null;

export async function loadFinance() {
  const [inv, bil, pay, bir] = await Promise.all([
    fetchInvoices(),
    fetchBills(),
    fetchPayrollRuns(),
    fetchBirFilings(),
  ]);
  setInvoices(inv || []);
  setBills(bil || []);
  setPayroll(pay || []);
  setBirFilings(bir || []);
  renderFinanceOverview(_invoices, _bills);
  renderAR(_invoices);
  renderAP(_bills);
  renderPayroll(_payroll);
  renderBIR();
}

export function showFinanceTab(name, el) {
  document.querySelectorAll('.ftab').forEach(t => t.classList.remove('active'));
  document.getElementById('ftab-' + name).classList.add('active');
  document.querySelectorAll('#finance-subtabs .sub-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
}

export function renderFinanceOverview(invoices, bills) {
  const summary = calcFinanceSummary(invoices, bills);
  const net     = summary.arOutstanding - summary.apOutstanding;

  document.getElementById('finance-stats').innerHTML = `
    <div class="stat-card"><div class="stat-label">AR Outstanding</div><div class="stat-value" style="font-size:22px">${formatCurrency(summary.arOutstanding)}</div><div class="stat-change">${summary.overdueCount} overdue invoice${summary.overdueCount !== 1 ? 's' : ''}</div></div>
    <div class="stat-card"><div class="stat-label">AP Outstanding</div><div class="stat-value" style="font-size:22px">${formatCurrency(summary.apOutstanding)}</div><div class="stat-change">${summary.pendingBillsCount} pending bills</div></div>
    <div class="stat-card"><div class="stat-label">Revenue Collected</div><div class="stat-value" style="font-size:22px">${formatCurrency(summary.revenueCollected)}</div><div class="stat-change up">This quarter</div></div>
    <div class="stat-card"><div class="stat-label">Net Position</div><div class="stat-value" style="font-size:22px${net < 0 ? ';color:var(--red)' : ''}">${formatCurrency(Math.abs(net))}</div><div class="stat-change ${net >= 0 ? 'up' : ''}">${net >= 0 ? 'Receivable surplus' : 'Payable deficit'}</div></div>`;

  document.getElementById('finance-recent-ar').innerHTML = invoices.slice(0, 4).map(i => `
    <div class="activity-item">
      <div class="activity-dot ${i.status === 'Paid' ? 'green' : i.status === 'Overdue' ? 'red' : 'blue'}"></div>
      <div style="flex:1"><div class="activity-text">${escapeHtml(i.client)} — ${escapeHtml(i.or_num)}</div><div class="activity-time">${escapeHtml(i.date)}</div></div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-family:'Cormorant Garamond',serif;font-size:14px;font-weight:600">${formatCurrency(i.amount)}</span>
        <span class="badge badge-${statusClass(i.status)}">${escapeHtml(i.status)}</span>
      </div>
    </div>`).join('');

  document.getElementById('finance-recent-ap').innerHTML = bills.slice(0, 4).map(b => `
    <div class="activity-item">
      <div class="activity-dot ${b.status === 'Paid' ? 'green' : 'blue'}"></div>
      <div style="flex:1"><div class="activity-text">${escapeHtml(b.payee)}</div><div class="activity-time">${escapeHtml(b.date)} · EWT ${escapeHtml(b.ewt)}</div></div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-family:'Cormorant Garamond',serif;font-size:14px;font-weight:600">${formatCurrency(b.amount)}</span>
        <span class="badge badge-${statusClass(b.status)}">${escapeHtml(b.status)}</span>
      </div>
    </div>`).join('');
}

// ── AR (Invoices) ─────────────────────────────────────────────────────────────

export function renderAR(invoices) {
  const total = invoices.reduce((s, i) => s + i.amount, 0);
  const out   = invoices.filter(i => i.status !== 'Paid').reduce((s, i) => s + i.amount, 0);
  document.getElementById('ar-summary').textContent =
    `${invoices.length} invoices · ${formatCurrency(total)} total · ${formatCurrency(out)} outstanding`;
  document.getElementById('ar-tbody').innerHTML = invoices.length
    ? invoices.map(i => `
        <tr>
          <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(i.or_num)}</td>
          <td style="font-weight:500;color:var(--ink)">${escapeHtml(i.client)}</td>
          <td class="amount-cell">${formatCurrency(i.amount)}</td>
          <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(i.date)}</td>
          <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(i.due)}</td>
          <td><span class="badge badge-${statusClass(i.status)}">${escapeHtml(i.status)}</span></td>
          <td>
            <div class="flex-gap" style="gap:4px">
              <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="openEditInvoice(${i.id})">Edit</button>
              <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--red)" onclick="handleDeleteInvoice(${i.id})">Delete</button>
            </div>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="7"><div class="empty-state">No invoices yet</div></td></tr>`;
}

function invoiceFormHTML(i = {}) {
  return `<div class="form-grid">
    <div class="form-group"><div class="form-label">OR Number</div><input class="form-input" id="fi-or" value="${escapeHtml(i.or_num || '')}" placeholder="OR-2026-005"/></div>
    <div class="form-group"><div class="form-label">Client</div><input class="form-input" id="fi-client" value="${escapeHtml(i.client || '')}" placeholder="Client name"/></div>
    <div class="form-group"><div class="form-label">Amount (₱)</div><input class="form-input" id="fi-amount" type="number" value="${i.amount || 0}"/></div>
    <div class="form-group"><div class="form-label">Status</div>
      <select class="form-input" id="fi-status">
        <option${i.status === 'Unpaid' ? ' selected' : ''}>Unpaid</option>
        <option${i.status === 'Paid' ? ' selected' : ''}>Paid</option>
        <option${i.status === 'Overdue' ? ' selected' : ''}>Overdue</option>
      </select>
    </div>
    <div class="form-group"><div class="form-label">Date Issued</div><input class="form-input" id="fi-date" type="date" value="${i.date || ''}"/></div>
    <div class="form-group"><div class="form-label">Due Date</div><input class="form-input" id="fi-due" type="date" value="${i.due || ''}"/></div>
  </div>`;
}

export function openAddInvoice() {
  _editingInvoiceId = null;
  openModal('New Invoice (AR)', invoiceFormHTML(), saveInvoice);
}

export function openEditInvoice(id) {
  const i = _invoices.find(x => x.id === id);
  if (!i) return;
  _editingInvoiceId = id;
  openModal('Edit Invoice', invoiceFormHTML(i), saveInvoice);
}

export async function saveInvoice() {
  const or_num = document.getElementById('fi-or').value.trim();
  const err = validateRequired(or_num, 'OR number');
  if (err) { toast(err, 'error'); return; }
  const payload = {
    or_num,
    client: document.getElementById('fi-client').value,
    amount: +document.getElementById('fi-amount').value || 0,
    status: document.getElementById('fi-status').value,
    date:   formatDateShort(document.getElementById('fi-date').value),
    due:    formatDateShort(document.getElementById('fi-due').value),
  };
  if (_editingInvoiceId) {
    const ok = await updateInvoice(_editingInvoiceId, payload);
    if (!ok) { toast('Could not update invoice', 'error'); return; }
    toast('Invoice updated', 'success');
  } else {
    const result = await createInvoice(payload);
    if (!result) return;
    toast('Invoice added', 'success');
  }
  closeModal();
  loadFinance();
}

export async function handleDeleteInvoice(id) {
  if (!confirm('Delete this invoice? This cannot be undone.')) return;
  const ok = await deleteInvoice(id);
  if (!ok) { toast('Could not delete invoice', 'error'); return; }
  toast('Invoice deleted', '');
  loadFinance();
}

// ── AP (Bills) ────────────────────────────────────────────────────────────────

export function renderAP(bills) {
  const total = bills.reduce((s, b) => s + b.amount, 0);
  const out   = bills.filter(b => b.status !== 'Paid').reduce((s, b) => s + b.amount, 0);
  document.getElementById('ap-summary').textContent =
    `${bills.length} bills · ${formatCurrency(total)} total · ${formatCurrency(out)} outstanding`;
  document.getElementById('ap-tbody').innerHTML = bills.length
    ? bills.map(b => `
        <tr>
          <td style="font-weight:500;color:var(--ink)">${escapeHtml(b.payee)}</td>
          <td class="amount-cell">${formatCurrency(b.amount)}</td>
          <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(b.date)}</td>
          <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(b.category)}</td>
          <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(b.ewt)}</td>
          <td><span class="badge badge-${statusClass(b.status)}">${escapeHtml(b.status)}</span></td>
          <td>
            <div class="flex-gap" style="gap:4px">
              <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="openEditBill(${b.id})">Edit</button>
              <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--red)" onclick="handleDeleteBill(${b.id})">Delete</button>
            </div>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="7"><div class="empty-state">No bills yet</div></td></tr>`;
}

function billFormHTML(b = {}) {
  const catOpts = ['Venue', 'Catering', 'Equipment', 'Services', 'Transport', 'Supplies', 'Other']
    .map(c => `<option${c === b.category ? ' selected' : ''}>${c}</option>`).join('');
  const ewtOpts = ['0%', '2%', '5%', '10%', '15%']
    .map(e => `<option${e === b.ewt ? ' selected' : ''}>${e}</option>`).join('');
  return `<div class="form-grid">
    <div class="form-group full"><div class="form-label">Payee</div><input class="form-input" id="fb-payee" value="${escapeHtml(b.payee || '')}" placeholder="Supplier / vendor name"/></div>
    <div class="form-group"><div class="form-label">Amount (₱)</div><input class="form-input" id="fb-amount" type="number" value="${b.amount || 0}"/></div>
    <div class="form-group"><div class="form-label">Category</div><select class="form-input" id="fb-category">${catOpts}</select></div>
    <div class="form-group"><div class="form-label">EWT Rate</div><select class="form-input" id="fb-ewt">${ewtOpts}</select></div>
    <div class="form-group"><div class="form-label">Date</div><input class="form-input" id="fb-bill-date" type="date" value="${b.date || ''}"/></div>
    <div class="form-group"><div class="form-label">Status</div>
      <select class="form-input" id="fb-status">
        <option${b.status === 'Unpaid' || !b.status ? ' selected' : ''}>Unpaid</option>
        <option${b.status === 'Paid' ? ' selected' : ''}>Paid</option>
      </select>
    </div>
  </div>`;
}

export function openAddBill() {
  _editingBillId = null;
  openModal('New Bill (AP)', billFormHTML(), saveBill);
}

export function openEditBill(id) {
  const b = _bills.find(x => x.id === id);
  if (!b) return;
  _editingBillId = id;
  openModal('Edit Bill', billFormHTML(b), saveBill);
}

export async function saveBill() {
  const payee = document.getElementById('fb-payee').value.trim();
  const err = validateRequired(payee, 'Payee');
  if (err) { toast(err, 'error'); return; }
  const payload = {
    payee,
    amount:   +document.getElementById('fb-amount').value || 0,
    category: document.getElementById('fb-category').value,
    ewt:      document.getElementById('fb-ewt').value,
    date:     formatDateShort(document.getElementById('fb-bill-date').value),
    status:   document.getElementById('fb-status').value,
  };
  if (_editingBillId) {
    const ok = await updateBill(_editingBillId, payload);
    if (!ok) { toast('Could not update bill', 'error'); return; }
    toast('Bill updated', 'success');
  } else {
    const result = await createBill(payload);
    if (!result) return;
    toast('Bill added', 'success');
  }
  closeModal();
  loadFinance();
}

export async function handleDeleteBill(id) {
  if (!confirm('Delete this bill? This cannot be undone.')) return;
  const ok = await deleteBill(id);
  if (!ok) { toast('Could not delete bill', 'error'); return; }
  toast('Bill deleted', '');
  loadFinance();
}

// ── Payroll ───────────────────────────────────────────────────────────────────

export function renderPayroll(runs) {
  document.getElementById('payroll-tbody').innerHTML = runs.length
    ? runs.map(r => `
        <tr>
          <td style="font-weight:500;color:var(--ink)">${escapeHtml(r.period)}</td>
          <td style="font-size:11.5px;color:var(--ink-3)">${r.employees}</td>
          <td class="amount-cell">${formatCurrency(r.gross)}</td>
          <td style="font-size:12px;color:var(--ink-3)">${formatCurrency(r.deductions)}</td>
          <td class="amount-cell">${formatCurrency(r.net)}</td>
          <td><span class="badge badge-${statusClass(r.status)}">${escapeHtml(r.status)}</span></td>
          <td>
            <div class="flex-gap" style="gap:4px">
              <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="openEditPayroll(${r.id})">Edit</button>
              <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--red)" onclick="handleDeletePayroll(${r.id})">Delete</button>
            </div>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="7"><div class="empty-state">No payroll runs yet</div></td></tr>`;
}

function payrollFormHTML(r = {}) {
  return `<div class="form-grid">
    <div class="form-group"><div class="form-label">Period</div><input class="form-input" id="pp-period" value="${escapeHtml(r.period || '')}" placeholder="e.g. Jun 2026"/></div>
    <div class="form-group"><div class="form-label">No. of Employees</div><input class="form-input" id="pp-emp" type="number" value="${r.employees || 0}"/></div>
    <div class="form-group"><div class="form-label">Gross Pay (₱)</div><input class="form-input" id="pp-gross" type="number" value="${r.gross || 0}" oninput="estimateDeductions()"/></div>
    <div class="form-group"><div class="form-label">Est. Deductions (₱)</div><input class="form-input" id="pp-ded" type="number" value="${r.deductions || 0}"/></div>
    <div class="form-group"><div class="form-label">Net Pay (₱)</div><input class="form-input" id="pp-net" type="number" value="${r.net || 0}"/></div>
    <div class="form-group"><div class="form-label">Status</div>
      <select class="form-input" id="pp-status">
        <option${r.status === 'Pending' || !r.status ? ' selected' : ''}>Pending</option>
        <option${r.status === 'Released' ? ' selected' : ''}>Released</option>
      </select>
    </div>
  </div>
  <div style="font-size:10px;color:var(--ink-3);margin-top:-8px">SSS ≈ 4.5% · PhilHealth ≈ 2.5% · Pag-IBIG ≈ 2% of gross</div>`;
}

export function openAddPayroll() {
  _editingPayrollId = null;
  openModal('New Payroll Run', payrollFormHTML(), savePayroll);
}

export function openEditPayroll(id) {
  const r = _payroll.find(x => x.id === id);
  if (!r) return;
  _editingPayrollId = id;
  openModal('Edit Payroll Run', payrollFormHTML(r), savePayroll);
}

export function estimateDeductions() {
  const gross = +document.getElementById('pp-gross').value || 0;
  const ded = Math.round(gross * 0.15);
  document.getElementById('pp-ded').value = ded;
  document.getElementById('pp-net').value = gross - ded;
}

export async function savePayroll() {
  const period = document.getElementById('pp-period').value.trim();
  const err = validateRequired(period, 'Period');
  if (err) { toast(err, 'error'); return; }
  const gross = +document.getElementById('pp-gross').value || 0;
  const ded   = +document.getElementById('pp-ded').value  || 0;
  const payload = {
    period,
    employees:  +document.getElementById('pp-emp').value || 0,
    gross, deductions: ded, net: gross - ded,
    status: document.getElementById('pp-status').value,
  };
  if (_editingPayrollId) {
    const ok = await updatePayrollRun(_editingPayrollId, payload);
    if (!ok) { toast('Could not update payroll run', 'error'); return; }
    toast('Payroll run updated', 'success');
  } else {
    const result = await createPayrollRun(payload);
    if (!result) return;
    toast('Payroll run saved', 'success');
  }
  closeModal();
  loadFinance();
}

export async function handleDeletePayroll(id) {
  if (!confirm('Delete this payroll run? This cannot be undone.')) return;
  const ok = await deletePayrollRun(id);
  if (!ok) { toast('Could not delete payroll run', 'error'); return; }
  toast('Payroll run deleted', '');
  loadFinance();
}

// ── BIR ───────────────────────────────────────────────────────────────────────

function birBadgeClass(status) {
  return status === 'Filed'    ? 'paid'
       : status === 'Overdue'  ? 'overdue'
       : status === 'Due Soon' ? 'unpaid'
       : status === 'Ongoing'  ? 'lead'
       : 'lead';
}

function birHistoryLine(form) {
  const past = birFilingsFor(_birFilings, form);
  if (!past.length) return `<span style="color:var(--ink-3)">No filings recorded yet</span>`;
  const last = past[0];
  return `${escapeHtml(last.period)} — <span style="color:var(--green);font-weight:600">Filed ✓</span>`
       + ` <span style="color:var(--ink-3)">${formatDateShort(String(last.filed_at).slice(0, 10))}`
       + `${past.length > 1 ? ` · ${past.length} total` : ''}</span>`;
}

function birPeriodicCard(form, desc, period, deadlineISO, baseLabel, baseValue) {
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

  const twoThreeOhSeven = bir2307Bills(_bills);
  const last2307 = twoThreeOhSeven
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];

  document.getElementById('bir-cards').innerHTML = `
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

export function openFileBir(form) {
  const today  = new Date();
  const { q, year } = birMostRecentCompletedQuarter(today);
  const birYear = APP_SETTINGS.finance.birYear;

  let period, base, suggestedTax, baseLabel, note;
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
  const form   = document.getElementById('bir-form').value.trim();
  const period = document.getElementById('bir-period').value.trim();
  const err = validateRequired(period, 'Period');
  if (err) { toast(err, 'error'); return; }
  const result = await createBirFiling({
    form,
    period,
    tax_base:     +document.getElementById('bir-base').value  || 0,
    tax_due:      +document.getElementById('bir-tax').value   || 0,
    reference_no: document.getElementById('bir-ref').value.trim(),
    notes:        document.getElementById('bir-notes').value.trim(),
    filed_at:     document.getElementById('bir-date').value || todayISO(),
  });
  if (!result) return;
  toast(`${form} filing recorded for ${period}`, 'success');
  closeModal();
  loadFinance();
}
