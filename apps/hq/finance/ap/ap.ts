import { formatCurrency } from '@shared/utils/formatUtils.ts';
import { formatDateShort } from '@shared/utils/dateUtils.ts';
import { escapeHtml } from '@shared/utils/helpers.ts';
import { validateRequired } from '@shared/utils/validators.ts';
import { APP_SETTINGS } from '@config/settings.ts';
import { nextDocNumber } from '@shared/services/documents/docNumberService.ts';
import { logDocActivity } from '@shared/services/documents/activityLogService.ts';
import { getCurrentUser } from '@shared/core/authService.ts';
import { buildDocPDF, docPDFTotals } from '@shared/documents/pdfTemplate.ts';
import {
  AP_CATEGORIES, AP_STATUSES, AP_STATUS_CLASS, apRowHTML, billFormHTML, displayDate,
} from '../templates/bills.ts';
import { paginationBar } from '../templates/invoices.ts';
import { createBill, updateBill, deleteBill } from '@hq/finance/financeService.ts';
import { sb } from '@shared/core/supabase';
import { _bills, _projects } from '@hq/core/state.ts';
import { toast, openModal, closeModal } from '@hq/core/ui.ts';
import type { Bill } from '@shared/types.ts';
import { loadFinance } from '../finance.ts';

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
  const container = document.getElementById('ptab-expenses');
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
      : nextDocNumber('EXP', _bills.map(b => b.expense_number ?? '')));

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

  const user = await getCurrentUser();
  const actor = user?.name ?? user?.email ?? null;
  if (_editingBillId) {
    const statusEl = document.getElementById('fb-status') as HTMLSelectElement | null;
    if (statusEl) payload.status = statusEl.value;
    const ok = await updateBill(_editingBillId, payload);
    if (!ok) { toast('Could not update expense', 'error'); return; }
    toast('Expense updated', 'success');
    await logDocActivity('bill', _editingBillId, expenseNumber, 'updated', actor);
  } else {
    payload.status = 'Pending';
    const result = await createBill(payload);
    if (!result) { toast('Could not add expense. Please try again.', 'error'); return; }
    toast('Expense added', 'success');
    await logDocActivity('bill', result.id, expenseNumber, 'created', actor);
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
  const bill = _bills.find(b => b.id === _approvingBillId);
  const ok = await updateBill(_approvingBillId, { status: 'Approved', approved_by: approver });
  if (!ok) { toast('Could not approve expense', 'error'); return; }
  toast('Expense approved', 'success');
  await logDocActivity('bill', _approvingBillId, bill?.expense_number ?? null, 'approved', approver);
  _approvingBillId = null;
  closeModal();
  loadFinance();
}

export async function rejectBill(id: number) {
  if (!confirm('Reject this expense and return it to Pending?')) return;
  const bill = _bills.find(b => b.id === id);
  const ok = await updateBill(id, { status: 'Pending' });
  if (!ok) { toast('Could not reject expense', 'error'); return; }
  toast('Expense returned to Pending', '');
  const user = await getCurrentUser();
  await logDocActivity('bill', id, bill?.expense_number ?? null, 'rejected', user?.name ?? user?.email ?? null);
  loadFinance();
}

export async function markBillPaid(id: number) {
  if (!confirm('Mark this expense as Paid?')) return;
  const bill = _bills.find(b => b.id === id);
  const ok = await updateBill(id, { status: 'Paid' });
  if (!ok) { toast('Could not mark as paid', 'error'); return; }
  toast('Expense marked as Paid', 'success');
  const user = await getCurrentUser();
  await logDocActivity('bill', id, bill?.expense_number ?? null, 'paid', user?.name ?? user?.email ?? null);
  loadFinance();
}

export async function archiveBill(id: number) {
  if (!confirm('Archive this expense? It will be hidden from the main view.')) return;
  const bill = _bills.find(b => b.id === id);
  const ok = await updateBill(id, { archived_at: new Date().toISOString() } as Partial<Bill>);
  if (!ok) { toast('Could not archive expense', 'error'); return; }
  toast('Expense archived', '');
  const user = await getCurrentUser();
  await logDocActivity('bill', id, bill?.expense_number ?? null, 'archived', user?.name ?? user?.email ?? null);
  loadFinance();
}

export async function handleDeleteBill(id: number) {
  if (!confirm('Delete this expense? This cannot be undone.')) return;
  const ok = await deleteBill(id);
  if (!ok) { toast('Could not delete expense', 'error'); return; }
  toast('Expense deleted', '');
  loadFinance();
}

export async function printExpenseVoucher(id: number) {
  const b = _bills.find(x => x.id === id);
  if (!b) return;
  const { company } = APP_SETTINGS;
  const ewtRate = b.ewt && b.ewt !== '0%' ? parseFloat(b.ewt) / 100 : 0;
  const ewtAmt  = b.amount * ewtRate;
  const netPay  = b.amount - ewtAmt;
  const proj    = _projects.find(p => p.id === b.project_id);
  const statusCls = AP_STATUS_CLASS[b.status] ?? 'pending';

  const body = `
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
    <div class="value">${b.date ? formatDateShort(b.date) : '—'}</div>
    ${b.due_date ? `<div class="label">Due Date</div><div class="value">${formatDateShort(b.due_date)}</div>` : ''}
    ${proj ? `<div class="label">Project</div><div class="value">${escapeHtml(proj.name)}</div>` : ''}
  </div>
</div>
<hr class="divider"/>
${docPDFTotals({ subtotal: b.amount, ewtRate: b.ewt, ewtAmount: ewtAmt, total: netPay, totalLabel: 'Net Payable' })}
${b.remarks ? `<hr class="divider"/><div class="label">Remarks</div><div class="value">${escapeHtml(b.remarks)}</div>` : ''}`

  const html = buildDocPDF({
    title: 'EXPENSE VOUCHER',
    number: b.expense_number ?? `EXP-${b.id}`,
    status: b.status,
    statusClass: statusCls,
    company: { name: company.name, address: company.address, email: company.email },
    body,
    sigLeft:  { label: 'Prepared By' },
    sigRight: b.approved_by ? { label: 'Approved By', name: b.approved_by } : { label: 'Approved By' },
  });

  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) { toast('Pop-up blocked — please allow pop-ups and try again', 'error'); return; }
  try {
    w.document.write(html);
    w.document.close();
    const user = await getCurrentUser();
    await logDocActivity('bill', id, b.expense_number ?? null, 'downloaded', user?.name ?? user?.email ?? null);
  } catch (error) {
    console.error('printExpenseVoucher failed:', error);
    w.close();
    toast('Could not generate PDF. Please try again.', 'error');
  }
}

// ── BIR ───────────────────────────────────────────────────────────────────────

