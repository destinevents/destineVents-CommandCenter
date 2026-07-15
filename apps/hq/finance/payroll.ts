import { formatCurrency } from '@shared/utils/formatUtils.ts';
import { escapeHtml } from '@shared/utils/helpers.ts';
import { validateRequired } from '@shared/utils/validators.ts';
import { APP_SETTINGS } from '@config/settings.js';
import { payrollTableHTML, payrollFormHTML, PAYROLL_STATUSES, EMPLOYEE_TYPES } from './templates/payroll.ts';
import {
  fetchPayrollRuns, createPayrollRun, updatePayrollRun, deletePayrollRun,
} from '@shared/services/finance/financeService.ts';
import { _payroll, setPayroll } from '@hq/state.ts';
import { toast, openModal, closeModal } from '@hq/ui.ts';
import type { PayrollRun } from '@shared/types.ts';

const gVal = (id: string) => (document.getElementById(id) as HTMLInputElement).value;

let _editingPayrollId: number | null = null;
let _payrollSearch    = '';
let _payrollFilterType   = '';
let _payrollFilterStatus = '';

export async function loadPayroll() {
  const runs = await fetchPayrollRuns();
  setPayroll(runs || []);
  renderPayroll(_payroll);
}

function _nextPayrollNumber(runs: PayrollRun[]): string {
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
  _payrollSearch       = (document.getElementById('pr-search')       as HTMLInputElement  | null)?.value.toLowerCase() ?? '';
  _payrollFilterType   = (document.getElementById('pr-filter-type')  as HTMLSelectElement | null)?.value ?? '';
  _payrollFilterStatus = (document.getElementById('pr-filter-status') as HTMLSelectElement | null)?.value ?? '';
  renderPayroll(_payroll);
}

export function clearPayrollFilters() {
  _payrollSearch       = '';
  _payrollFilterType   = '';
  _payrollFilterStatus = '';
  renderPayroll(_payroll);
}

export function renderPayroll(runs: PayrollRun[]) {
  const container = document.getElementById('ftab-payroll');
  if (!container) return;

  const now = new Date();

  const pending  = runs.filter(r => r.status === 'Pending');
  const released = runs.filter(r => r.status === 'Released');
  const relThisMonth = released.filter(r =>
    r.period.includes(String(now.getFullYear())) &&
    r.period.toLowerCase().includes(now.toLocaleString('en-PH', { month: 'short' }).toLowerCase())
  );
  const totalNet = runs.reduce((s, r) => s + (r.net || 0), 0);
  const sumOf    = (arr: PayrollRun[]) => arr.reduce((s, r) => s + (r.net || 0), 0);

  let filtered = [...runs];
  if (_payrollSearch)       filtered = filtered.filter(r =>
    (r.employee_name ?? '').toLowerCase().includes(_payrollSearch) ||
    (r.payroll_number ?? '').toLowerCase().includes(_payrollSearch) ||
    r.period.toLowerCase().includes(_payrollSearch)
  );
  if (_payrollFilterType)   filtered = filtered.filter(r => r.employee_type === _payrollFilterType);
  if (_payrollFilterStatus) filtered = filtered.filter(r => r.status === _payrollFilterStatus);

  const hasFilters = !!(_payrollSearch || _payrollFilterType || _payrollFilterStatus);

  const typeOpts = EMPLOYEE_TYPES
    .map(t => `<option value="${t}"${_payrollFilterType === t ? ' selected' : ''}>${t}</option>`).join('');
  const statusOpts = PAYROLL_STATUSES
    .map(s => `<option value="${s}"${_payrollFilterStatus === s ? ' selected' : ''}>${s}</option>`).join('');

  container.innerHTML = `
    <div class="finance-stat-grid" style="margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">Pending Payroll</div>
        <div class="stat-value" style="font-size:22px;color:var(--amber)">${formatCurrency(sumOf(pending))}</div>
        <div class="stat-change">${pending.length} record${pending.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Released This Month</div>
        <div class="stat-value" style="font-size:22px;color:var(--green)">${formatCurrency(sumOf(relThisMonth))}</div>
        <div class="stat-change">${relThisMonth.length} payslip${relThisMonth.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Released (All Time)</div>
        <div class="stat-value" style="font-size:22px">${formatCurrency(sumOf(released))}</div>
        <div class="stat-change">${released.length} released</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Payroll (All)</div>
        <div class="stat-value" style="font-size:22px">${formatCurrency(totalNet)}</div>
        <div class="stat-change">${runs.length} record${runs.length !== 1 ? 's' : ''}</div>
      </div>
    </div>

    <div class="page-actions" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;gap:8px;flex:1;flex-wrap:wrap;align-items:center">
        <input class="form-input" id="pr-search" placeholder="Search name, payroll #, period…"
          value="${escapeHtml(_payrollSearch)}" oninput="setPayrollFilter()" style="width:240px"/>
        <select class="form-input" id="pr-filter-type" onchange="setPayrollFilter()" style="width:160px">
          <option value="">All Types</option>
          ${typeOpts}
        </select>
        <select class="form-input" id="pr-filter-status" onchange="setPayrollFilter()" style="width:150px">
          <option value="">All Statuses</option>
          ${statusOpts}
        </select>
        ${hasFilters ? `<button class="btn btn-ghost" onclick="clearPayrollFilters()" style="font-size:12px">Clear</button>` : ''}
      </div>
      <button class="btn btn-primary" onclick="openAddPayroll()">+ New Payroll Record</button>
    </div>

    <div style="border:1px solid var(--ink-4);overflow:hidden">
      <table class="ledger-table">
        <thead>
          <tr>
            <th>Period</th>
            <th>Employee</th>
            <th>Pay Breakdown</th>
            <th>Deductions</th>
            <th>Net Pay</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
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
  const sss        = Math.round(basic * 0.045);
  const philhealth = Math.round(basic * 0.025);
  const pagibig    = Math.round(basic * 0.02);
  const total      = sss + philhealth + pagibig;
  const dedInput   = document.getElementById('pp-ded') as HTMLInputElement | null;
  if (dedInput) { dedInput.value = String(total); recalcPayroll(); }
  toast(`Auto-deductions: SSS ₱${sss} + PhilHealth ₱${philhealth} + Pag-IBIG ₱${pagibig} = ₱${total}`, 'success');
}

export async function savePayroll() {
  const employee_name = (document.getElementById('pp-employee') as HTMLInputElement).value.trim();
  const empErr = validateRequired(employee_name, 'Employee name');
  if (empErr) { toast(empErr, 'error'); return; }
  const period    = gVal('pp-period').trim();
  const periodErr = validateRequired(period, 'Pay period');
  if (periodErr) { toast(periodErr, 'error'); return; }
  const basic_pay  = +(document.getElementById('pp-basic')     as HTMLInputElement).value || 0;
  if (!basic_pay || basic_pay <= 0) { toast('Basic pay must be greater than ₱0', 'error'); return; }
  const overtime   = +(document.getElementById('pp-overtime')  as HTMLInputElement).value || 0;
  const allowances = +(document.getElementById('pp-allowances') as HTMLInputElement).value || 0;
  const deductions = +(document.getElementById('pp-ded')       as HTMLInputElement).value || 0;
  if (overtime < 0 || allowances < 0 || deductions < 0) {
    toast('Overtime, allowances, and deductions cannot be negative', 'error'); return;
  }
  const gross = basic_pay + overtime + allowances;
  if (deductions > gross) {
    toast('Deductions cannot exceed gross pay', 'error'); return;
  }
  const net          = gross - deductions;
  const hours_worked = +(document.getElementById('pp-hours') as HTMLInputElement).value || null;

  const payload: Partial<PayrollRun> = {
    employee_name,
    employee_type: (document.getElementById('pp-type') as HTMLSelectElement).value as PayrollRun['employee_type'],
    period,
    hours_worked:  hours_worked ?? undefined,
    basic_pay,
    overtime,
    allowances,
    gross,
    deductions,
    net,
    status:   (document.getElementById('pp-status') as HTMLSelectElement).value,
    notes:    (document.getElementById('pp-notes')  as HTMLInputElement).value.trim() || null,
    employees: 1,
  };

  if (_editingPayrollId) {
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
}

export async function markPayrollReleased(id: number) {
  if (!confirm('Mark this payroll as Released?')) return;
  const ok = await updatePayrollRun(id, { status: 'Released' });
  if (!ok) { toast('Could not mark as Released', 'error'); return; }
  toast('Payroll marked as Released', 'success');
  await loadPayroll();
}

export async function handleDeletePayroll(id: number) {
  if (!confirm('Delete this payroll record? This cannot be undone.')) return;
  const ok = await deletePayrollRun(id);
  if (!ok) { toast('Could not delete payroll record', 'error'); return; }
  toast('Payroll record deleted', '');
  await loadPayroll();
}

export function printPayslip(id: number) {
  const r = _payroll.find(x => x.id === id);
  if (!r) return;
  const { company } = APP_SETTINGS;
  const gross = r.gross ?? ((r.basic_pay || 0) + (r.overtime || 0) + (r.allowances || 0));
  const w = window.open('', '_blank', 'width=860,height=700');
  if (!w) { toast('Pop-up blocked — please allow pop-ups and try again', 'error'); return; }
  w.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Payslip ${escapeHtml(r.payroll_number ?? String(r.id))}</title>
<style>
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
  @media print{body{padding:24px}.no-print{display:none}}
</style>
</head>
<body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px">
  <div>
    <div class="brand">destine<span>vents</span></div>
    <div class="tagline">${escapeHtml(company.name)}</div>
    <div style="font-size:11px;color:#888;margin-top:8px;line-height:1.7">${escapeHtml(company.address)}</div>
  </div>
  <div>
    <div class="doc-title">PAYSLIP</div>
    <div class="doc-num">${escapeHtml(r.payroll_number ?? `PAY-${r.id}`)}</div>
    <div style="text-align:right;margin-top:6px;font-size:12px;color:#888">${escapeHtml(r.status)}</div>
  </div>
</div>

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
    ${r.hours_worked ? `<div class="label">Hours Worked</div><div class="value">${r.hours_worked} hrs</div>` : ''}
  </div>
</div>

<div class="section-head">Earnings</div>
<table class="pay-table">
  <tr><td>Basic Pay</td><td>${formatCurrency(r.basic_pay || 0)}</td></tr>
  ${r.overtime  ? `<tr><td>Overtime</td><td>${formatCurrency(r.overtime)}</td></tr>`   : ''}
  ${r.allowances ? `<tr><td>Allowances</td><td>${formatCurrency(r.allowances)}</td></tr>` : ''}
  <tr style="background:#f9f6f0"><td style="font-weight:700">Gross Pay</td><td style="font-weight:700">${formatCurrency(gross)}</td></tr>
</table>

<div class="section-head">Deductions</div>
<table class="pay-table">
  <tr><td>Total Deductions (SSS / PhilHealth / Pag-IBIG)</td><td style="color:#c0392b">− ${formatCurrency(r.deductions || 0)}</td></tr>
</table>

<div class="net-box">
  <div class="label" style="font-size:11px">Net Pay</div>
  <div class="net-amount">₱${(r.net || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
</div>

${r.notes ? `<div style="padding:12px 16px;background:#f9f6f0;border-radius:6px;font-size:12px;color:#555;margin-bottom:16px"><strong>Notes:</strong> ${escapeHtml(r.notes)}</div>` : ''}

<div class="sig-grid">
  <div>
    <div class="label">Prepared By</div>
    <div class="sig-line"></div>
    <div style="font-size:11px;color:#888;margin-top:6px">HR / Finance Officer</div>
  </div>
  <div>
    <div class="label">Received By</div>
    <div class="sig-line"></div>
    <div style="font-size:11px;color:#888;margin-top:6px">${escapeHtml(r.employee_name ?? 'Employee')}</div>
  </div>
</div>

<div class="no-print" style="margin-top:28px">
  <button onclick="window.print()" style="padding:8px 20px;background:#1a1a1a;color:#fff;border:none;border-radius:4px;font-size:13px;cursor:pointer">Print / Save as PDF</button>
</div>

<div class="footer">
  DestineVents Collective OPC · Baguio City, Philippines · destinevents.biz@gmail.com<br>
  This payslip is confidential. For payroll-related concerns, contact HR.
</div>
</body>
</html>`);
  w.document.close();
  w.focus();
}

export function sendPayrollEmail(id: number) {
  const r = _payroll.find(x => x.id === id);
  if (!r) return;
  const defaultSubject = `Payslip ${r.payroll_number ?? ''} — ${r.period}`;
  const defaultBody = [
    `Dear ${r.employee_name ?? 'Team Member'},`,
    '',
    `Please find attached your payslip for the period ${r.period}.`,
    `Net Pay: ₱${(r.net || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
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
    const to      = (document.getElementById('pe-to')      as HTMLInputElement).value.trim();
    const subject = (document.getElementById('pe-subject') as HTMLInputElement).value.trim();
    const body    = (document.getElementById('pe-body')    as HTMLTextAreaElement).value.trim();
    if (!to) { toast('Recipient email is required', 'error'); return; }
    window.open(`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
    toast('Email client opened', 'success');
    closeModal();
  }, 'Open Email Client');
}
