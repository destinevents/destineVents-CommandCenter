import { formatCurrency } from '@shared/utils/formatUtils.ts';
import { escapeHtml } from '@shared/utils/helpers.ts';
import { validateRequired, validateEmail } from '@shared/utils/validators.ts';
import { APP_SETTINGS } from '@config/settings.js';
import { getCurrentUser } from '@shared/services/core/authService.ts';
import { payrollTableHTML, payrollFormHTML, PAYROLL_STATUSES, EMPLOYEE_TYPES } from './templates/payroll.ts';
import {
  fetchPayrollRuns, createPayrollRun, updatePayrollRun, deletePayrollRun,
} from '@shared/services/finance/financeService.ts';
import { _payroll, setPayroll } from '@hq/state.ts';
import { toast, openModal, closeModal } from '@hq/ui.ts';
import type { PayrollRun } from '@shared/types.ts';

// H2: null-safe — consistent with setPayrollFilter which already uses optional chaining
const gVal = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? '';

let _editingPayrollId: number | null = null;
let _payrollSearch       = '';
let _payrollFilterType   = '';
let _payrollFilterStatus = '';
let _payrollFilterDateFrom = '';
let _payrollFilterDateTo   = '';

// L4: named constants — rates are legally significant and updated periodically
const SSS_RATE        = 0.045;
const PHILHEALTH_RATE = 0.025;
const PAGIBIG_RATE    = 0.02;

export async function loadPayroll() {
  try {
    const runs = await fetchPayrollRuns();
    setPayroll(runs || []);
    renderPayroll(_payroll);
  } catch (error) {
    console.error('loadPayroll failed:', error);
    toast('Could not load payroll records', 'error');
  }
}

export function _nextPayrollNumber(runs: PayrollRun[]): string {
  const year = new Date().getFullYear();
  const existing = runs
    .map(r => r.payroll_number ?? '')
    .filter(n => n.startsWith(`PAY-${year}-`))
    .map(n => parseInt(n.split('-')[2] ?? '0', 10))
    .filter(n => !isNaN(n));
  const next = existing.length ? Math.max(...existing) + 1 : 1;
  return `PAY-${year}-${String(next).padStart(3, '0')}`;
}

export function setPayrollFilter() {
  _payrollSearch         = (document.getElementById('pr-search')       as HTMLInputElement  | null)?.value.toLowerCase() ?? '';
  _payrollFilterType     = (document.getElementById('pr-filter-type')  as HTMLSelectElement | null)?.value ?? '';
  _payrollFilterStatus   = (document.getElementById('pr-filter-status') as HTMLSelectElement | null)?.value ?? '';
  _payrollFilterDateFrom = (document.getElementById('pr-date-from')    as HTMLInputElement  | null)?.value ?? '';
  _payrollFilterDateTo   = (document.getElementById('pr-date-to')      as HTMLInputElement  | null)?.value ?? '';
  renderPayroll(_payroll);
}

export function clearPayrollFilters() {
  _payrollSearch         = '';
  _payrollFilterType     = '';
  _payrollFilterStatus   = '';
  _payrollFilterDateFrom = '';
  _payrollFilterDateTo   = '';
  renderPayroll(_payroll);
}

function _payrollStatsHTML(runs: PayrollRun[], now: Date): string {
  const pending       = runs.filter(r => r.status === 'Pending');
  const paid          = runs.filter(r => r.status === 'Paid');
  const paidThisMonth = paid.filter(r => {
    const d = new Date(r.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const totalNet = runs.reduce((s, r) => s + (r.net || 0), 0);
  const sumOf    = (arr: PayrollRun[]) => arr.reduce((s, r) => s + (r.net || 0), 0);
  return `
    <div class="finance-stat-grid" style="margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">Pending Payroll</div>
        <div class="stat-value" style="font-size:22px;color:var(--amber)">${formatCurrency(sumOf(pending))}</div>
        <div class="stat-change">${pending.length} record${pending.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Paid This Month</div>
        <div class="stat-value" style="font-size:22px;color:var(--green)">${formatCurrency(sumOf(paidThisMonth))}</div>
        <div class="stat-change">${paidThisMonth.length} payslip${paidThisMonth.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Paid (All Time)</div>
        <div class="stat-value" style="font-size:22px">${formatCurrency(sumOf(paid))}</div>
        <div class="stat-change">${paid.length} paid</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Payroll (All)</div>
        <div class="stat-value" style="font-size:22px">${formatCurrency(totalNet)}</div>
        <div class="stat-change">${runs.length} record${runs.length !== 1 ? 's' : ''}</div>
      </div>
    </div>`;
}

function _payrollToolbarHTML(typeOpts: string, statusOpts: string, hasFilters: boolean): string {
  return `
    <div class="page-actions" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;gap:8px;flex:1;flex-wrap:wrap;align-items:center">
        <input class="form-input" id="pr-search" placeholder="Search name, payroll #, period…"
          value="${escapeHtml(_payrollSearch)}" oninput="setPayrollFilter()" style="width:220px"/>
        <select class="form-input" id="pr-filter-type" onchange="setPayrollFilter()" style="width:150px">
          <option value="">All Types</option>
          ${typeOpts}
        </select>
        <select class="form-input" id="pr-filter-status" onchange="setPayrollFilter()" style="width:130px">
          <option value="">All Statuses</option>
          ${statusOpts}
        </select>
        <input class="form-input" id="pr-date-from" type="date" value="${_payrollFilterDateFrom}"
          onchange="setPayrollFilter()" title="Created from" style="width:145px"/>
        <input class="form-input" id="pr-date-to" type="date" value="${_payrollFilterDateTo}"
          onchange="setPayrollFilter()" title="Created to" style="width:145px"/>
        ${hasFilters ? `<button class="btn btn-ghost" onclick="clearPayrollFilters()" style="font-size:12px">Clear</button>` : ''}
      </div>
      <button class="btn btn-primary" onclick="openAddPayroll()">+ New Payroll Record</button>
    </div>`;
}

export function renderPayroll(runs: PayrollRun[]) {
  const container = document.getElementById('ftab-payroll');
  if (!container) return;

  let filtered = [...runs];
  if (_payrollSearch)       filtered = filtered.filter(r =>
    (r.employee_name ?? '').toLowerCase().includes(_payrollSearch) ||
    (r.payroll_number ?? '').toLowerCase().includes(_payrollSearch) ||
    r.period.toLowerCase().includes(_payrollSearch)
  );
  if (_payrollFilterType)     filtered = filtered.filter(r => r.employee_type === _payrollFilterType);
  if (_payrollFilterStatus)   filtered = filtered.filter(r => r.status === _payrollFilterStatus);
  if (_payrollFilterDateFrom) filtered = filtered.filter(r => r.created_at >= _payrollFilterDateFrom);
  if (_payrollFilterDateTo)   filtered = filtered.filter(r => r.created_at <= _payrollFilterDateTo + 'T23:59:59');

  const hasFilters = !!(_payrollSearch || _payrollFilterType || _payrollFilterStatus || _payrollFilterDateFrom || _payrollFilterDateTo);
  const typeOpts   = EMPLOYEE_TYPES.map(t => `<option value="${t}"${_payrollFilterType === t ? ' selected' : ''}>${t}</option>`).join('');
  const statusOpts = PAYROLL_STATUSES.map(s => `<option value="${s}"${_payrollFilterStatus === s ? ' selected' : ''}>${s}</option>`).join('');

  container.innerHTML =
    _payrollStatsHTML(runs, new Date()) +
    _payrollToolbarHTML(typeOpts, statusOpts, hasFilters) + `
    <div style="border:1px solid var(--ink-4);overflow:hidden">
      <table class="ledger-table">
        <thead><tr>
          <th>Period</th><th>Employee</th><th>Pay Breakdown</th>
          <th>Deductions</th><th>Net Pay</th><th>Status</th><th aria-label="Actions"></th>
        </tr></thead>
        <tbody>
          ${filtered.length
            ? payrollTableHTML(filtered)
            : `<tr><td colspan="7"><div class="empty-state">${hasFilters ? 'No records match filters' : 'No payroll records yet'}</div></td></tr>`}
        </tbody>
      </table>
    </div>`;
}

export function openAddPayroll() {
  _editingPayrollId = null;
  openModal('New Payroll Record', payrollFormHTML(), savePayroll);
}

export function openEditPayroll(id: number) {
  const r = _payroll.find(x => x.id === id);
  if (!r) return;
  _editingPayrollId = id;
  openModal('Edit Payroll Record', payrollFormHTML(r), savePayroll);
}

export function recalcPayroll(): void {
  const getNum = (id: string) => +((document.getElementById(id) as HTMLInputElement | null)?.value ?? '0') || 0;
  const basic      = getNum('pp-basic');
  const overtime   = getNum('pp-overtime');
  const allowances = getNum('pp-allowances');
  const ded        = getNum('pp-ded');
  const gross      = basic + overtime + allowances;
  const net        = gross - ded;

  const grossEl = document.getElementById('pp-gross-display');
  const dedEl   = document.getElementById('pp-ded-display');
  const netEl   = document.getElementById('pp-net-display');
  if (grossEl) grossEl.textContent = formatCurrency(gross);
  if (dedEl)   dedEl.textContent   = `− ${formatCurrency(ded)}`;
  if (netEl)   netEl.textContent   = formatCurrency(net);
}

export function autoFillDeductions(): void {
  const basic      = +((document.getElementById('pp-basic') as HTMLInputElement | null)?.value ?? '0') || 0;
  const sss        = Math.round(basic * SSS_RATE);
  const philhealth = Math.round(basic * PHILHEALTH_RATE);
  const pagibig    = Math.round(basic * PAGIBIG_RATE);
  const total      = sss + philhealth + pagibig;
  const dedInput   = document.getElementById('pp-ded') as HTMLInputElement | null;
  if (dedInput) {
    dedInput.value = String(total);
    recalcPayroll();
    toast(`Auto-deductions: SSS ${formatCurrency(sss)} + PhilHealth ${formatCurrency(philhealth)} + Pag-IBIG ${formatCurrency(pagibig)} = ${formatCurrency(total)}`, 'success');
  }
}

// H3: validation/read extracted so savePayroll stays under 50 lines
function _readPayrollForm(): Partial<PayrollRun> | null {
  const employee_name = gVal('pp-employee').trim();
  const empErr = validateRequired(employee_name, 'Employee name');
  if (empErr) { toast(empErr, 'error'); return null; }

  const period    = gVal('pp-period').trim();
  const periodErr = validateRequired(period, 'Pay period');
  if (periodErr) { toast(periodErr, 'error'); return null; }

  const basic_pay = +gVal('pp-basic') || 0;
  if (basic_pay <= 0) { toast('Basic pay must be greater than ₱0', 'error'); return null; }

  const overtime   = +gVal('pp-overtime')   || 0;
  const allowances = +gVal('pp-allowances') || 0;
  const deductions = +gVal('pp-ded')        || 0;
  if (overtime < 0 || allowances < 0 || deductions < 0) {
    toast('Overtime, allowances, and deductions cannot be negative', 'error'); return null;
  }
  const gross = basic_pay + overtime + allowances;
  if (deductions > gross) {
    toast('Deductions cannot exceed gross pay', 'error'); return null;
  }

  // M1: explicit parse so hours=0 is preserved (not dropped by || null)
  const rawHours   = gVal('pp-hours').trim();
  const hours_worked = rawHours === '' ? undefined : Number(rawHours);

  // M5: validate against allowed enum values before casting
  const rawType   = gVal('pp-type');
  const rawStatus = gVal('pp-status');
  const employee_type = (EMPLOYEE_TYPES as readonly string[]).includes(rawType)
    ? rawType as PayrollRun['employee_type']
    : 'Employee';
  const status = (PAYROLL_STATUSES as readonly string[]).includes(rawStatus) ? rawStatus : 'Draft';

  return {
    employee_name,
    employee_type,
    period,
    hours_worked,
    basic_pay,
    overtime,
    allowances,
    gross,
    deductions,
    net: gross - deductions,
    status,
    notes:     gVal('pp-notes').trim() || null,
    employees: 1,
  };
}

export async function savePayroll() {
  const payload = _readPayrollForm();
  if (!payload) return;
  try {
    if (_editingPayrollId !== null) {
      const ok = await updatePayrollRun(_editingPayrollId, payload);
      if (!ok) { toast('Could not update payroll record', 'error'); return; }
      toast('Payroll record updated', 'success');
    } else {
      payload.payroll_number = _nextPayrollNumber(_payroll);
      const result = await createPayrollRun(payload);
      if (!result) { toast('Could not save payroll record. Please try again.', 'error'); return; }
      toast('Payroll record saved', 'success');
    }
    closeModal();
    await loadPayroll();
  } catch (error) {
    console.error('savePayroll failed:', error);
    toast('An unexpected error occurred. Please try again.', 'error');
  }
}

export async function markPayrollPaid(id: number) {
  if (!confirm('Mark this payroll as Paid?')) return;
  try {
    const user = await getCurrentUser();
    const released_by = user?.name ?? user?.email ?? null;
    const ok = await updatePayrollRun(id, { status: 'Paid', released_by });
    if (!ok) { toast('Could not mark as Paid', 'error'); return; }
    toast('Payroll marked as Paid', 'success');
    await loadPayroll();
  } catch (error) {
    console.error('markPayrollPaid failed:', error);
    toast('An unexpected error occurred. Please try again.', 'error');
  }
}

export async function handleDeletePayroll(id: number) {
  if (!confirm('Delete this payroll record? This cannot be undone.')) return;
  try {
    const ok = await deletePayrollRun(id);
    if (!ok) { toast('Could not delete payroll record', 'error'); return; }
    toast('Payroll record deleted', 'success');
    await loadPayroll();
  } catch (error) {
    console.error('handleDeletePayroll failed:', error);
    toast('An unexpected error occurred. Please try again.', 'error');
  }
}

function _payslipCSS(): string {
  return `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;background:#fff;padding:48px}
  .brand{font-size:26px;font-weight:700;letter-spacing:-0.5px}
  .brand span{font-weight:300;color:#666}
  .tagline{font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#888;margin-top:3px}
  .doc-title{font-size:20px;font-weight:600;color:#999;text-align:right}
  .doc-num{font-size:26px;font-weight:700;text-align:right;letter-spacing:-0.5px}
  .label{font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#888;margin-bottom:3px}
  .value{font-size:13px;color:#1a1a1a;margin-bottom:10px}
  table.pay-table{width:100%;border-collapse:collapse;margin:20px 0}
  table.pay-table td{padding:8px 12px;border-bottom:1px solid #e8e3da;font-size:13px}
  table.pay-table td:last-child{text-align:right;font-weight:500}
  .section-head{background:#f5f0e8;padding:6px 12px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#666}
  .net-box{background:#f5f9f2;border:1px solid #c8e6c9;border-radius:8px;padding:20px 24px;margin:24px 0;text-align:center}
  .net-amount{font-size:36px;font-weight:700;color:#1a7a45;margin-top:8px}
  .sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:48px;margin-top:40px}
  .sig-line{border-top:1px solid #1a1a1a;padding-top:8px;font-size:11px;color:#888;margin-top:40px}
  .footer{margin-top:40px;padding-top:16px;border-top:1px solid #e8e3da;font-size:10px;color:#aaa;text-align:center;line-height:1.8}
  @media print{body{padding:24px}.no-print{display:none}}`;
}

function _payslipHeaderHTML(r: PayrollRun, company: { name: string; address: string }, tin: string): string {
  const issueDate = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  return `
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px">
  <div>
    <div class="brand">destine<span>vents</span></div>
    <div class="tagline">${escapeHtml(company.name)}</div>
    <div style="font-size:11px;color:#888;margin-top:8px;line-height:1.7">${escapeHtml(company.address)}</div>
    ${tin ? `<div style="font-size:11px;color:#888">TIN: ${escapeHtml(tin)}</div>` : ''}
  </div>
  <div>
    <div class="doc-title">PAYSLIP</div>
    <div class="doc-num">${escapeHtml(r.payroll_number ?? `PAY-${r.id}`)}</div>
    <div style="text-align:right;margin-top:6px;font-size:12px;color:#888">${escapeHtml(r.status)}</div>
    <div style="text-align:right;margin-top:4px;font-size:11px;color:#aaa">Issued: ${issueDate}</div>
  </div>
</div>`;
}

function _payslipBodyHTML(r: PayrollRun, gross: number, company: { name: string; address: string; email?: string }): string {
  return `
<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;padding-bottom:24px;border-bottom:1px solid #e8e3da">
  <div>
    <div class="label">Employee</div>
    <div class="value" style="font-weight:600;font-size:15px">${escapeHtml(r.employee_name ?? '—')}</div>
    <div class="label">Employee Type</div>
    <div class="value">${escapeHtml(r.employee_type ?? '—')}</div>
  </div>
  <div>
    <div class="label">Pay Period</div>
    <div class="value" style="font-weight:600">${escapeHtml(r.period)}</div>
    ${r.hours_worked != null ? `<div class="label">Hours Worked</div><div class="value">${r.hours_worked} hrs</div>` : ''}
  </div>
</div>
<div class="section-head">Earnings</div>
<table class="pay-table">
  <tr><td>Basic Pay</td><td>${formatCurrency(r.basic_pay || 0)}</td></tr>
  ${r.overtime   ? `<tr><td>Overtime</td><td>${formatCurrency(r.overtime)}</td></tr>`    : ''}
  ${r.allowances ? `<tr><td>Allowances</td><td>${formatCurrency(r.allowances)}</td></tr>` : ''}
  <tr style="background:#f9f6f0"><td style="font-weight:700">Gross Pay</td><td style="font-weight:700">${formatCurrency(gross)}</td></tr>
</table>
<div class="section-head">Deductions</div>
<table class="pay-table">
  <tr><td>Total Deductions (SSS / PhilHealth / Pag-IBIG)</td><td style="color:#c0392b">− ${formatCurrency(r.deductions || 0)}</td></tr>
</table>
<div class="net-box">
  <div class="label" style="font-size:11px">Net Pay</div>
  <div class="net-amount">${formatCurrency(r.net || 0)}</div>
</div>
${r.notes ? `<div style="padding:12px 16px;background:#f9f6f0;border-radius:6px;font-size:12px;color:#555;margin-bottom:16px"><strong>Notes:</strong> ${escapeHtml(r.notes)}</div>` : ''}
<div class="sig-grid">
  <div><div class="label">Prepared By</div><div class="sig-line"></div><div style="font-size:11px;color:#888;margin-top:6px">${r.released_by ? escapeHtml(r.released_by) : 'HR / Finance Officer'}</div></div>
  <div><div class="label">Received By</div><div class="sig-line"></div><div style="font-size:11px;color:#888;margin-top:6px">${escapeHtml(r.employee_name ?? 'Employee')}</div></div>
</div>
<div class="no-print" style="margin-top:28px">
  <button onclick="window.print()" style="padding:8px 20px;background:#1a1a1a;color:#fff;border:none;border-radius:4px;font-size:13px;cursor:pointer">Print / Save as PDF</button>
</div>
<div class="footer">
  ${escapeHtml(company.name)} · ${escapeHtml(company.address)}${company.email ? ` · ${escapeHtml(company.email)}` : ''}<br>
  This payslip is confidential. For payroll-related concerns, contact HR.
</div>`;
}

function _buildPayslipDoc(r: PayrollRun, gross: number, company: { name: string; address: string; email?: string }, tin: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>Payslip ${escapeHtml(r.payroll_number ?? String(r.id))}</title>
<style>${_payslipCSS()}</style></head><body>
${_payslipHeaderHTML(r, company, tin)}
${_payslipBodyHTML(r, gross, company)}
</body></html>`;
}

export function printPayslip(id: number) {
  const r = _payroll.find(x => x.id === id);
  if (!r) return;
  const { company, banking } = APP_SETTINGS;
  const gross = r.gross ?? ((r.basic_pay || 0) + (r.overtime || 0) + (r.allowances || 0));
  const w = window.open('', '_blank', 'width=860,height=700');
  if (!w) { toast('Pop-up blocked — please allow pop-ups and try again', 'error'); return; }
  try {
    w.document.write(_buildPayslipDoc(r, gross, company, banking.tin));
    w.document.close();
    w.focus();
  } catch (error) {
    console.error('printPayslip failed:', error);
    w.close();
    toast('Could not generate payslip. Please try again.', 'error');
  }
}

export function sendPayrollEmail(id: number) {
  const r = _payroll.find(x => x.id === id);
  if (!r) return;
  const defaultSubject = `Payslip${r.payroll_number ? ` ${r.payroll_number}` : ''} — ${r.period}`;
  const defaultBody = [
    `Dear ${r.employee_name ?? 'Team Member'},`,
    '',
    `Please find attached your payslip for the period ${r.period}.`,
    `Net Pay: ${formatCurrency(r.net || 0)}`,
    '',
    'For any questions regarding this payslip, please reach out to HR.',
    '',
    'Thank you.',
  ].join('\n');

  openModal('Email Payslip', `
    <div style="font-size:11px;color:var(--ink-3);margin-bottom:12px">
      Payslip <strong>${escapeHtml(r.payroll_number ?? '')}</strong> · ${escapeHtml(r.employee_name ?? '')} · ${formatCurrency(r.net || 0)} net
    </div>
    <div class="form-grid">
      <div class="form-group full"><div class="form-label">To (Recipient Email)</div><input class="form-input" id="pe-to" type="email" placeholder="employee@example.com"/></div>
      <div class="form-group full"><div class="form-label">Subject</div><input class="form-input" id="pe-subject" value="${escapeHtml(defaultSubject)}"/></div>
      <div class="form-group full"><div class="form-label">Message</div><textarea class="form-input" id="pe-body" rows="7" style="font-size:11.5px;line-height:1.6">${escapeHtml(defaultBody)}</textarea></div>
    </div>
    <div style="font-size:10.5px;color:var(--ink-3);margin-top:8px">
      This will open your email client. Attach the payslip PDF (click <strong>Generate Payslip</strong> first to save it).
    </div>`, () => {
    const to      = gVal('pe-to').trim();
    const subject = gVal('pe-subject').trim();
    const body    = gVal('pe-body').trim();
    if (!to) { toast('Recipient email is required', 'error'); return; }
    // L7: reuse shared validateEmail instead of duplicating the regex
    const emailErr = validateEmail(to);
    if (emailErr) { toast(emailErr, 'error'); return; }
    window.open(`mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
    toast('Email client opened', 'success');
    closeModal();
  }, 'Open Email Client');
}
