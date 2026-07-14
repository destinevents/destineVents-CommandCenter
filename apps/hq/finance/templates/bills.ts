import type { Bill, Project } from '@shared/types.ts';
import { escapeHtml } from '@shared/utils/helpers.ts';
import { formatCurrency } from '@shared/utils/formatUtils.ts';
import { formatDateShort } from '@shared/utils/dateUtils.ts';

function toISODate(val: string | null | undefined): string {
  if (!val || val === '—') return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export function displayDate(val: string | null | undefined): string {
  if (!val || val === '—') return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return formatDateShort(val);
  return escapeHtml(String(val));
}

export const AP_CATEGORIES = ['Office','Software','Marketing','Travel','Events','Utilities','Taxes','Payroll','Freelancers','Suppliers','Miscellaneous'];
export const AP_STATUSES   = ['Pending','For Approval','Approved','Paid','Cancelled'];
export const AP_STATUS_CLASS: Record<string, string> = {
  'Pending':      'pending',
  'For Approval': 'for-approval',
  'Approved':     'ap-approved',
  'Paid':         'paid',
  'Cancelled':    'cancelled',
};

// ── Bill row ──────────────────────────────────────────────────────────────────

export function apRowHTML(b: Bill, projects: Project[]): string {
  const vendor    = escapeHtml(b.vendor ?? b.payee ?? '—');
  const proj      = projects.find(p => p.id === b.project_id);
  const projName  = proj ? escapeHtml(proj.name) : '—';
  const statusCls = AP_STATUS_CLASS[b.status] ?? 'pending';

  let actions = '';
  if (b.status === 'Pending') {
    actions = `
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="openEditBill(${b.id})">Edit</button>
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--blue)" onclick="submitBillForApproval(${b.id})">Submit</button>
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--red)" onclick="handleDeleteBill(${b.id})">Delete</button>`;
  } else if (b.status === 'For Approval') {
    actions = `
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--green)" onclick="approveBill(${b.id})">Approve</button>
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--red)" onclick="rejectBill(${b.id})">Reject</button>`;
  } else if (b.status === 'Approved') {
    actions = `
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--green)" onclick="markBillPaid(${b.id})">Mark Paid</button>
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="printExpenseVoucher(${b.id})">PDF</button>`;
  } else if (b.status === 'Paid') {
    actions = `
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="printExpenseVoucher(${b.id})">PDF</button>
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--ink-3)" onclick="archiveBill(${b.id})">Archive</button>`;
  } else if (b.status === 'Cancelled') {
    actions = `
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--ink-3)" onclick="archiveBill(${b.id})">Archive</button>`;
  }

  return `<tr>
    <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(b.expense_number ?? '—')}</td>
    <td style="font-weight:500;color:var(--ink)">${vendor}${b.receipt_url ? ` <span title="Receipt attached" style="color:var(--green);font-size:10px">📎</span>` : ''}</td>
    <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(b.category ?? '—')}</td>
    <td style="font-size:11px;color:var(--ink-3)">${projName}</td>
    <td style="font-size:11px;color:var(--ink-3)">${displayDate(b.date)}</td>
    <td style="font-size:11px;color:var(--ink-3)">${displayDate(b.due_date)}</td>
    <td class="amount-cell">${formatCurrency(b.amount)}</td>
    <td><span class="badge badge-${statusCls}">${escapeHtml(b.status)}</span></td>
    <td><div class="flex-gap" style="gap:4px">${actions}</div></td>
  </tr>`;
}

// ── Bill form ─────────────────────────────────────────────────────────────────

export function billFormHTML(
  b: Partial<Bill> = {},
  isEdit: boolean,
  projects: Project[],
  ewtRates: string[],
): string {
  const catOpts  = AP_CATEGORIES.map(c => `<option${c === b.category ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('');
  const ewtOpts  = ewtRates.map(e => `<option${e === (b.ewt ?? '0%') ? ' selected' : ''}>${e}</option>`).join('');
  const projOpts = `<option value="">— No project —</option>` +
    projects.map(p => `<option value="${p.id}"${b.project_id === p.id ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
  const statusOpts = AP_STATUSES.map(s => `<option${s === b.status ? ' selected' : ''}>${s}</option>`).join('');

  return `<div class="form-grid">
    <div class="form-group"><div class="form-label">Expense #</div><input class="form-input" id="fb-expense-num" value="${escapeHtml(b.expense_number ?? '')}" placeholder="Auto-generated" ${isEdit ? '' : 'readonly'}/></div>
    <div class="form-group"><div class="form-label">Vendor *</div><input class="form-input" id="fb-vendor" value="${escapeHtml(b.vendor ?? b.payee ?? '')}" placeholder="Supplier or vendor name" required/></div>
    <div class="form-group"><div class="form-label">Category</div><select class="form-input" id="fb-category">${catOpts}</select></div>
    <div class="form-group"><div class="form-label">Project (optional)</div><select class="form-input" id="fb-project">${projOpts}</select></div>
    <div class="form-group"><div class="form-label">Vendor Invoice #</div><input class="form-input" id="fb-invoice-num" value="${escapeHtml(b.invoice_number ?? '')}" placeholder="Vendor's invoice ref"/></div>
    <div class="form-group"><div class="form-label">Purchase Order</div><input class="form-input" id="fb-po" value="${escapeHtml(b.purchase_order ?? '')}" placeholder="PO number"/></div>
    <div class="form-group"><div class="form-label">Date</div><input class="form-input" id="fb-bill-date" type="date" value="${toISODate(b.date)}"/></div>
    <div class="form-group"><div class="form-label">Due Date</div><input class="form-input" id="fb-due-date" type="date" value="${toISODate(b.due_date)}"/></div>
    <div class="form-group"><div class="form-label">Amount (₱) *</div><input class="form-input" id="fb-amount" type="number" min="0" step="0.01" value="${b.amount ?? 0}"/></div>
    <div class="form-group"><div class="form-label">EWT Rate</div><select class="form-input" id="fb-ewt">${ewtOpts}</select></div>
    <div class="form-group full"><div class="form-label">Receipt URL (optional)</div><input class="form-input" id="fb-receipt" value="${escapeHtml(b.receipt_url ?? '')}" placeholder="https://… paste link to uploaded receipt"/></div>
    <div class="form-group full"><div class="form-label">Remarks</div><textarea class="form-input" id="fb-remarks" rows="2" placeholder="Notes or additional details">${escapeHtml(b.remarks ?? '')}</textarea></div>
    ${isEdit ? `<div class="form-group"><div class="form-label">Status</div><select class="form-input" id="fb-status">${statusOpts}</select></div>` : ''}
  </div>`;
}
