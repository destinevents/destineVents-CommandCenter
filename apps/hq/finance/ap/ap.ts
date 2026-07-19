import { formatCurrency } from '@shared/utils/formatUtils.ts';
import { formatDateShort } from '@shared/utils/dateUtils.ts';
import { escapeHtml } from '@shared/utils/helpers.ts';
import { validateRequired } from '@shared/utils/validators.ts';
import { APP_SETTINGS } from '@config/settings.ts';
import {
  AP_CATEGORIES, AP_STATUSES, AP_STATUS_CLASS, apRowHTML, billFormHTML, displayDate,
} from '../templates/bills.ts';
import { paginationBar } from '../templates/invoices.ts';
import {
  fetchBills, createBill, updateBill, deleteBill,
} from '@hq/finance/financeService.ts';
import { fetchPartners } from '@hq/partners/partnerService.ts';
import { sb } from '@shared/core/supabase';
import {
  _bills, _clients, _partners, _projects,
  setBills, setPartners,
} from '@hq/core/state.ts';
import { toast, openModal, closeModal } from '@hq/core/ui.ts';
import type { Bill } from '@shared/types.ts';
// eslint-disable-next-line import/no-cycle
import { loadFinance } from '../finance.ts';

const gEl = (id: string) => document.getElementById(id)!;
const gVal = (id: string) => (document.getElementById(id) as HTMLInputElement).value;

// ── AP module-level state ─────────────────────────────────────────────────────
let _editingBillId: number | null   = null;
let _apFilterCategory               = '';
let _apFilterStatus                 = '';
let _apFilterSearch                 = '';
let _apFilterDateFrom               = '';
let _apFilterDateTo                 = '';
let _apBillPage                     = 1;
let _approvingBillId: number | null = null;
const AP_PAGE_SIZE                  = 20;

// ── AP (Payables) ─────────────────────────────────────────────────────────────

export function setApFilter() {
  _apFilterCategory = (document.getElementById('ap-filter-cat')    as HTMLSelectElement | null)?.value ?? '';
  _apFilterStatus   = (document.getElementById('ap-filter-status') as HTMLSelectElement | null)?.value ?? '';
  _apFilterSearch   = (document.getElementById('ap-filter-search') as HTMLInputElement  | null)?.value.toLowerCase() ?? '';
  _apFilterDateFrom = (document.getElementById('ap-filter-from')   as HTMLInputElement  | null)?.value ?? '';
  _apFilterDateTo   = (document.getElementById('ap-filter-to')     as HTMLInputElement  | null)?.value ?? '';
  _apBillPage = 1;
  renderAP(_bills);
}

export function clearApFilters() {
  _apFilterCategory = '';
  _apFilterStatus   = '';
  _apFilterSearch   = '';
  _apFilterDateFrom = '';
  _apFilterDateTo   = '';
  _apBillPage = 1;
  renderAP(_bills);
}

export function setApBillPage(p: number) {
  _apBillPage = p;
  renderAP(_bills);
}

export function renderAP(bills: Bill[]) {
  const container = document.getElementById('ftab-payables');
  if (!container) return;

  const active    = bills.filter(b => !b.archived_at);
  const now       = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const pendingBills     = active.filter(b => b.status === 'Pending');
  const forApprovalBills = active.filter(b => b.status === 'For Approval');
  const approvedBills    = active.filter(b => b.status === 'Approved');
  const paidThisMonth    = active.filter(b => b.status === 'Paid' && (b.date ?? '').startsWith(thisMonth));

  let filtered = active;
  if (_apFilterCategory) filtered = filtered.filter(b => b.category === _apFilterCategory);
  if (_apFilterStatus)   filtered = filtered.filter(b => b.status   === _apFilterStatus);
  if (_apFilterSearch)   filtered = filtered.filter(b =>
    (b.vendor ?? b.payee ?? '').toLowerCase().includes(_apFilterSearch) ||
    (b.expense_number ?? '').toLowerCase().includes(_apFilterSearch)
  );
  if (_apFilterDateFrom) filtered = filtered.filter(b => !!b.date && b.date >= _apFilterDateFrom);
  if (_apFilterDateTo)   filtered = filtered.filter(b => !!b.date && b.date <= _apFilterDateTo);

  const hasFilters = !!(  _apFilterCategory || _apFilterStatus || _apFilterSearch || _apFilterDateFrom || _apFilterDateTo);
  const total      = filtered.length;
  const paged      = filtered.slice((_apBillPage - 1) * AP_PAGE_SIZE, _apBillPage * AP_PAGE_SIZE);

  const sumOf = (arr: Bill[]) => arr.reduce((s, b) => s + b.amount, 0);

  container.innerHTML = `
    <div class="finance-stat-grid" style="margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">Pending</div>
        <div class="stat-value" style="font-size:22px">${formatCurrency(sumOf(pendingBills))}</div>
        <div class="stat-change">${pendingBills.length} expense${pendingBills.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Awaiting Approval</div>
        <div class="stat-value" style="font-size:22px;color:var(--amber)">${forApprovalBills.length}</div>
        <div class="stat-change">${formatCurrency(sumOf(forApprovalBills))}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Approved</div>
        <div class="stat-value" style="font-size:22px;color:var(--blue)">${formatCurrency(sumOf(approvedBills))}</div>
        <div class="stat-change">${approvedBills.length} expense${approvedBills.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Paid This Month</div>
        <div class="stat-value" style="font-size:22px;color:var(--green)">${formatCurrency(sumOf(paidThisMonth))}</div>
        <div class="stat-change">${paidThisMonth.length} payment${paidThisMonth.length !== 1 ? 's' : ''}</div>
      </div>
    </div>

    <div class="page-actions" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;gap:8px;flex:1;flex-wrap:wrap;align-items:center">
        <input class="form-input" id="ap-filter-search" placeholder="Search vendor or expense #…" value="${escapeHtml(_apFilterSearch)}" oninput="setApFilter()" style="width:220px"/>
        <select class="form-input" id="ap-filter-cat" onchange="setApFilter()" style="width:160px">
          <option value="">All Categories</option>
          ${AP_CATEGORIES.map(c => `<option${_apFilterCategory === c ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('')}
        </select>
        <select class="form-input" id="ap-filter-status" onchange="setApFilter()" style="width:150px">
          <option value="">All Statuses</option>
          ${AP_STATUSES.map(s => `<option${_apFilterStatus === s ? ' selected' : ''}>${escapeHtml(s)}</option>`).join('')}
        </select>
        <input class="form-input" id="ap-filter-from" type="date" value="${_apFilterDateFrom}" onchange="setApFilter()" title="From date" style="width:140px"/>
        <input class="form-input" id="ap-filter-to"   type="date" value="${_apFilterDateTo}"   onchange="setApFilter()" title="To date"   style="width:140px"/>
        ${hasFilters ? `<button class="btn btn-ghost" onclick="clearApFilters()" style="font-size:12px">Clear filters</button>` : ''}
      </div>
      <button class="btn btn-primary" onclick="openAddBill()">+ New Expense</button>
    </div>

    <div style="border:1px solid var(--ink-4);overflow:hidden">
      <table class="ledger-table">
        <thead>
          <tr>
            <th>Expense #</th>
            <th>Vendor</th>
            <th>Category</th>
            <th>Project</th>
            <th>Date</th>
            <th>Due Date</th>
            <th>Amount</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${paged.length
            ? paged.map(b => apRowHTML(b, _projects)).join('')
            : `<tr><td colspan="9"><div class="empty-state">${hasFilters ? 'No expenses match filters' : 'No expenses yet'}</div></td></tr>`}
        </tbody>
      </table>
      ${paginationBar(_apBillPage, total, AP_PAGE_SIZE, 'setApBillPage')}
    </div>`;
}

// ── Receipt storage helpers ───────────────────────────────────────────────────

const RECEIPT_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

async function uploadReceiptFile(file: File): Promise<string | null> {
  if (file.size > 5 * 1024 * 1024) {
    toast('Receipt file must be under 5 MB', 'error');
    return null;
  }
  const ext  = (file.name.split('.').pop() ?? 'bin').slice(0, 10);
  const path = `receipts/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from('receipts').upload(path, file, { upsert: false });
  if (error) {
    toast('Receipt upload failed', 'error');
    return null;
  }
  const { data } = await sb.storage.from('receipts').createSignedUrl(path, RECEIPT_TTL_SECONDS);
  return data?.signedUrl ?? null;
}

async function deleteReceiptFile(url: string | null | undefined): Promise<void> {
  if (!url) return;
  try {
    const match = url.match(/\/object\/(?:sign|public)\/receipts\/([^?#]+)/);
    if (match?.[1]) await sb.storage.from('receipts').remove([match[1]]);
  } catch { /* non-critical: orphaned file is preferable to a blocking error */ }
}

export function openAddBill() {
  _editingBillId = null;
  openModal('New Expense', billFormHTML({}, false, _projects, APP_SETTINGS.finance.ewtRates as string[]), saveBill);
}

export function openEditBill(id: number) {
  const b = _bills.find(x => x.id === id);
  if (!b) return;
  _editingBillId = id;
  openModal('Edit Expense', billFormHTML(b, true, _projects, APP_SETTINGS.finance.ewtRates as string[]), saveBill);
}

export async function saveBill() {
  const vendor = (document.getElementById('fb-vendor') as HTMLInputElement).value.trim();
  const err = validateRequired(vendor, 'Vendor');
  if (err) { toast(err, 'error'); return; }
  const amount = +((document.getElementById('fb-amount') as HTMLInputElement).value);
  if (!amount || amount <= 0) { toast('Amount must be greater than ₱0', 'error'); return; }

  const projVal  = (document.getElementById('fb-project')     as HTMLSelectElement).value;
  const expInput = (document.getElementById('fb-expense-num') as HTMLInputElement).value.trim();
  const expenseNumber = expInput
    || (_editingBillId
      ? (_bills.find(b => b.id === _editingBillId)?.expense_number ?? null)
      : `EXP-${new Date().getFullYear()}-${String(_bills.filter(b => !b.archived_at).length + 1).padStart(3, '0')}`);

  // ── Receipt file upload ────────────────────────────────────────────────────
  const existingBill  = _editingBillId ? _bills.find(b => b.id === _editingBillId) : null;
  let receiptUrl: string | null = existingBill?.receipt_url ?? null;

  const fileInput = document.getElementById('fb-receipt-file') as HTMLInputElement | null;
  const file = fileInput?.files?.[0] ?? null;
  if (file) {
    const uploaded = await uploadReceiptFile(file);
    if (!uploaded) return;
    await deleteReceiptFile(existingBill?.receipt_url);
    receiptUrl = uploaded;
  }

  const payload: Partial<Bill> = {
    vendor,
    payee:          vendor,
    expense_number: expenseNumber,
    amount,
    category:       (document.getElementById('fb-category')    as HTMLSelectElement).value,
    project_id:     projVal ? +projVal : null,
    invoice_number: (document.getElementById('fb-invoice-num') as HTMLInputElement).value.trim()    || null,
    purchase_order: (document.getElementById('fb-po')          as HTMLInputElement).value.trim()    || null,
    date:           (document.getElementById('fb-bill-date')   as HTMLInputElement).value           || null,
    due_date:       (document.getElementById('fb-due-date')    as HTMLInputElement).value           || null,
    ewt:            (document.getElementById('fb-ewt')         as HTMLSelectElement).value,
    receipt_url:    receiptUrl,
    remarks:        (document.getElementById('fb-remarks')     as HTMLTextAreaElement).value.trim() || null,
  };

  if (_editingBillId) {
    const statusEl = document.getElementById('fb-status') as HTMLSelectElement | null;
    if (statusEl) payload.status = statusEl.value;
    const ok = await updateBill(_editingBillId, payload);
    if (!ok) { toast('Could not update expense', 'error'); return; }
    toast('Expense updated', 'success');
  } else {
    payload.status = 'Pending';
    const result = await createBill(payload);
    if (!result) { toast('Could not add expense. Please try again.', 'error'); return; }
    toast('Expense added', 'success');
  }
  closeModal();
  loadFinance();
}

export function openUploadReceipt(id: number) {
  const b = _bills.find(x => x.id === id);
  if (!b) return;
  openModal(
    `Upload Receipt — ${escapeHtml(b.vendor ?? b.payee ?? '')}`,
    `<div style="margin-bottom:12px;font-size:11px;color:var(--ink-3)">
       ${b.receipt_url
         ? `Current receipt: <a href="${escapeHtml(b.receipt_url)}" target="_blank" rel="noopener noreferrer" style="color:var(--blue)">View</a> · Upload a new file to replace it.`
         : 'No receipt attached yet.'}
     </div>
     <div class="form-group">
       <div class="form-label">Receipt File (JPG, PNG or PDF — max 5 MB)</div>
       <input class="form-input" id="ur-file" type="file" accept="image/*,.pdf" style="padding:6px"/>
     </div>`,
    async () => {
      const fileInput = document.getElementById('ur-file') as HTMLInputElement | null;
      const file = fileInput?.files?.[0] ?? null;
      if (!file) { toast('Please select a file', 'error'); return; }
      const uploaded = await uploadReceiptFile(file);
      if (!uploaded) return;
      await deleteReceiptFile(b.receipt_url);
      const ok = await updateBill(id, { receipt_url: uploaded });
      if (!ok) { toast('Could not save receipt link', 'error'); return; }
      toast('Receipt uploaded ✓', 'success');
      closeModal();
      loadFinance();
    },
    'Upload',
  );
}

export async function submitBillForApproval(id: number) {
  if (!confirm('Submit this expense for approval?')) return;
  const ok = await updateBill(id, { status: 'For Approval' });
  if (!ok) { toast('Could not submit for approval', 'error'); return; }
  toast('Expense submitted for approval', 'success');
  loadFinance();
}

export function approveBill(id: number) {
  const b = _bills.find(x => x.id === id);
  if (!b) return;
  _approvingBillId = id;
  openModal('Approve Expense', `
    <div style="margin-bottom:14px;font-size:13px;color:var(--ink-2)">
      Approving expense from <strong>${escapeHtml(b.vendor ?? b.payee)}</strong><br>
      <span style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:700;color:var(--ink)">${formatCurrency(b.amount)}</span>
    </div>
    <div class="form-grid">
      <div class="form-group full">
        <div class="form-label">Approved By *</div>
        <input class="form-input" id="ap-approver" value="${escapeHtml(b.approved_by ?? '')}" placeholder="Name of approver"/>
      </div>
    </div>`, saveApproveBill, 'Approve');
}

export async function saveApproveBill() {
  if (!_approvingBillId) return;
  const approver = (document.getElementById('ap-approver') as HTMLInputElement).value.trim();
  if (!approver) { toast('Approver name is required', 'error'); return; }
  const ok = await updateBill(_approvingBillId, { status: 'Approved', approved_by: approver });
  if (!ok) { toast('Could not approve expense', 'error'); return; }
  toast('Expense approved', 'success');
  _approvingBillId = null;
  closeModal();
  loadFinance();
}

export async function rejectBill(id: number) {
  if (!confirm('Reject this expense and return it to Pending?')) return;
  const ok = await updateBill(id, { status: 'Pending' });
  if (!ok) { toast('Could not reject expense', 'error'); return; }
  toast('Expense returned to Pending', '');
  loadFinance();
}

export async function markBillPaid(id: number) {
  if (!confirm('Mark this expense as Paid?')) return;
  const ok = await updateBill(id, { status: 'Paid' });
  if (!ok) { toast('Could not mark as paid', 'error'); return; }
  toast('Expense marked as Paid', 'success');
  loadFinance();
}

export async function archiveBill(id: number) {
  if (!confirm('Archive this expense? It will be hidden from the main view.')) return;
  const ok = await updateBill(id, { archived_at: new Date().toISOString() } as Partial<Bill>);
  if (!ok) { toast('Could not archive expense', 'error'); return; }
  toast('Expense archived', '');
  loadFinance();
}

export async function handleDeleteBill(id: number) {
  if (!confirm('Delete this expense? This cannot be undone.')) return;
  const ok = await deleteBill(id);
  if (!ok) { toast('Could not delete expense', 'error'); return; }
  toast('Expense deleted', '');
  loadFinance();
}

export function printExpenseVoucher(id: number) {
  const b = _bills.find(x => x.id === id);
  if (!b) return;
  const { company } = APP_SETTINGS;
  const ewtRate = b.ewt && b.ewt !== '0%' ? parseFloat(b.ewt) / 100 : 0;
  const ewtAmt  = b.amount * ewtRate;
  const netPay  = b.amount - ewtAmt;
  const proj    = _projects.find(p => p.id === b.project_id);
  const w       = window.open('', '_blank', 'width=900,height=700');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Expense Voucher ${escapeHtml(b.expense_number ?? String(b.id))}</title>
<style>
  body{font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;background:#fff;padding:48px}
  .brand{font-size:26px;font-weight:700;letter-spacing:-0.5px}
  .brand span{font-weight:300;color:#666}
  .tagline{font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#888;margin-top:3px}
  .ev-title{font-size:22px;font-weight:600;color:#999;text-align:right}
  .ev-num{font-size:28px;font-weight:700;text-align:right;letter-spacing:-0.5px}
  .label{font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#888;margin-bottom:3px}
  .value{font-size:13px;color:#1a1a1a;margin-bottom:12px}
  .divider{border:none;border-top:1px solid #e8e3da;margin:20px 0}
  .total-row{display:flex;justify-content:space-between;font-size:13px;padding:4px 0}
  .total-final{font-size:20px;font-weight:700;border-top:2px solid #1a1a1a;padding-top:10px;margin-top:8px;display:flex;justify-content:space-between}
  .sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:48px;margin-top:48px}
  .sig-line{border-top:1px solid #1a1a1a;padding-top:8px;font-size:11px;color:#888;margin-top:48px}
  .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase}
  .badge-paid{background:#d4f5e2;color:#1a7a45}
  .badge-approved{background:#dbeafe;color:#1d4ed8}
  .badge-for-approval{background:#fef3c7;color:#92400e}
  .badge-pending{background:#f3f4f6;color:#6b7280}
  .badge-cancelled{background:#f3f4f6;color:#9ca3af}
  .footer{margin-top:48px;padding-top:18px;border-top:1px solid #e8e3da;font-size:10px;color:#aaa;text-align:center;line-height:1.8}
  @media print{body{padding:24px}.no-print{display:none}}
</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px">
  <div>
    <div class="brand">destine<span>vents</span></div>
    <div class="tagline">${escapeHtml(company.name)}</div>
    <div style="font-size:11px;color:#888;margin-top:8px;line-height:1.7">${escapeHtml(company.address)}</div>
  </div>
  <div>
    <div class="ev-title">Expense Voucher</div>
    <div class="ev-num">${escapeHtml(b.expense_number ?? `EXP-${b.id}`)}</div>
    <div style="text-align:right;margin-top:6px"><span class="badge badge-${AP_STATUS_CLASS[b.status] ?? 'pending'}">${escapeHtml(b.status)}</span></div>
  </div>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px">
  <div>
    <div class="label">Vendor</div>
    <div class="value" style="font-weight:600">${escapeHtml(b.vendor ?? b.payee)}</div>
    ${b.invoice_number ? `<div class="label">Vendor Invoice #</div><div class="value">${escapeHtml(b.invoice_number)}</div>` : ''}
    ${b.purchase_order ? `<div class="label">Purchase Order</div><div class="value">${escapeHtml(b.purchase_order)}</div>` : ''}
  </div>
  <div>
    <div class="label">Category</div>
    <div class="value">${escapeHtml(b.category ?? '—')}</div>
    <div class="label">Date</div>
    <div class="value">${displayDate(b.date)}</div>
    ${b.due_date ? `<div class="label">Due Date</div><div class="value">${displayDate(b.due_date)}</div>` : ''}
    ${proj ? `<div class="label">Project</div><div class="value">${escapeHtml(proj.name)}</div>` : ''}
  </div>
</div>

<hr class="divider"/>
<div style="max-width:400px;margin-left:auto">
  <div class="total-row"><span>Amount</span><span>${formatCurrency(b.amount)}</span></div>
  ${ewtAmt > 0 ? `<div class="total-row"><span>EWT Deduction (${escapeHtml(b.ewt)})</span><span style="color:#c0392b">− ${formatCurrency(ewtAmt)}</span></div>` : ''}
  <div class="total-final"><span>Net Payable</span><span>${formatCurrency(netPay)}</span></div>
</div>

${b.remarks ? `<hr class="divider"/><div class="label">Remarks</div><div class="value">${escapeHtml(b.remarks)}</div>` : ''}

<div class="sig-grid">
  <div>
    <div class="label">Prepared By</div>
    <div class="sig-line"></div>
    <div style="font-size:11px;color:#888;margin-top:6px">Signature / Name</div>
  </div>
  <div>
    <div class="label">Approved By</div>
    <div style="margin-top:${b.approved_by ? '12px' : '40px'};padding-top:8px;border-top:1px solid #1a1a1a;font-size:${b.approved_by ? '13px' : '11px'};color:${b.approved_by ? '#1a1a1a' : '#888'}">${b.approved_by ? escapeHtml(b.approved_by) : 'Signature / Name'}</div>
  </div>
</div>

<div class="footer no-print" style="margin-top:32px">
  <button onclick="window.print()" style="background:#252f27;color:#fff;border:none;padding:8px 22px;font-size:12px;cursor:pointer;font-family:inherit;letter-spacing:0.05em">Print / Save as PDF</button>
</div>
<div class="footer">
  Generated by DestineVents HQ · ${new Date().toLocaleDateString('en-PH', { year:'numeric', month:'long', day:'numeric' })}
</div>
</body></html>`);
  w.document.close();
}

// ── BIR ───────────────────────────────────────────────────────────────────────

