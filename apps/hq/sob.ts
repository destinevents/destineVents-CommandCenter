import { formatCurrency } from '../../shared/utils/formatUtils.ts';
import { formatDateShort, todayISO } from '../../shared/utils/dateUtils.ts';
import { escapeHtml, statusClass } from '../../shared/utils/helpers.ts';
import { validateRequired } from '../../shared/utils/validators.ts';
import {
  fetchSOBs, fetchSOBLineItems, createSOB, updateSOB, deleteSOB, upsertSOBLineItems,
} from '../../shared/services/sobService.ts';
import { _clients, _projects, _invoices, _sobs, setSOBs } from './state.ts';
import { toast, openModal, closeModal } from './ui.ts';
import type { SOB, SOBLineItem, InvoiceLineItem } from '../../shared/types.ts';

let _editingSOBId: number | null  = null;
let _showArchivedSOBs             = false;

function toISODate(val: string | null | undefined) {
  if (!val || val === '—') return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function displayDate(val: string | null | undefined) {
  if (!val || val === '—') return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return formatDateShort(val);
  return escapeHtml(String(val));
}

function sobLineItemRowHTML(item: Partial<SOBLineItem> = {}) {
  const lineTotal = (item.quantity ?? 1) * (item.unit_price ?? 0) * (1 + (item.vat_rate ?? 0) / 100);
  return `
    <tr class="sob-li-row">
      <td style="padding:3px 4px"><input class="form-input sob-li-desc" style="font-size:12px;padding:4px 6px" value="${escapeHtml(item.description || '')}" placeholder="Service / item" oninput="recalcSOB()"/></td>
      <td style="padding:3px 4px"><input class="form-input sob-li-qty" style="font-size:12px;padding:4px 6px;text-align:right" type="number" value="${item.quantity ?? 1}" min="0" step="any" oninput="recalcSOB()"/></td>
      <td style="padding:3px 4px"><input class="form-input sob-li-price" style="font-size:12px;padding:4px 6px;text-align:right" type="number" value="${item.unit_price ?? 0}" min="0" step="any" oninput="recalcSOB()"/></td>
      <td style="padding:3px 4px"><input class="form-input sob-li-vat" style="font-size:12px;padding:4px 6px;text-align:right" type="number" value="${item.vat_rate ?? 0}" min="0" max="100" step="any" oninput="recalcSOB()"/></td>
      <td class="sob-li-amt" style="padding:3px 4px;text-align:right;font-size:12px">${formatCurrency(lineTotal)}</td>
      <td style="padding:3px 4px"><button type="button" class="btn btn-ghost" style="padding:2px 6px;font-size:11px;color:var(--red)" onclick="this.closest('tr').remove();recalcSOB()">×</button></td>
    </tr>`;
}

function sobFormHTML(s: Partial<SOB> = {}, items: SOBLineItem[] = []) {
  const clientOpts  = _clients.map(c => `<option value="${escapeHtml(c.name)}"/>`).join('');
  const projectOpts = `<option value="">— no project —</option>` +
    _projects.map(p => `<option value="${p.id}"${s.project_id === p.id ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
  const hasItems    = items.length > 0;
  const subtotal    = items.reduce((sum, li) => sum + li.quantity * li.unit_price, 0);
  const vatAmt      = items.reduce((sum, li) => sum + li.quantity * li.unit_price * li.vat_rate / 100, 0);
  const discount    = s.discount ?? 0;
  const total       = subtotal + vatAmt - discount;

  return `<datalist id="sob-client-list">${clientOpts}</datalist>
  <div class="form-grid">
    <div class="form-group"><div class="form-label">SOB Number</div><input class="form-input" id="sob-num" value="${escapeHtml(s.sob_num || '')}" placeholder="SOB-2026-001"/></div>
    <div class="form-group"><div class="form-label">Client</div><input class="form-input" id="sob-client" value="${escapeHtml(s.client || '')}" list="sob-client-list" placeholder="Client name" autocomplete="off"/></div>
    <div class="form-group"><div class="form-label">Status</div>
      <select class="form-input" id="sob-status">
        <option${s.status === 'Draft' || !s.status ? ' selected' : ''}>Draft</option>
        <option${s.status === 'Sent' ? ' selected' : ''}>Sent</option>
        <option${s.status === 'Viewed' ? ' selected' : ''}>Viewed</option>
        <option${s.status === 'Partially Paid' ? ' selected' : ''}>Partially Paid</option>
        <option${s.status === 'Paid' ? ' selected' : ''}>Paid</option>
        <option${s.status === 'Cancelled' ? ' selected' : ''}>Cancelled</option>
      </select>
    </div>
    <div class="form-group"><div class="form-label">Issue Date</div><input class="form-input" id="sob-issue" type="date" value="${toISODate(s.issue_date)}"/></div>
    <div class="form-group"><div class="form-label">Due Date</div><input class="form-input" id="sob-due" type="date" value="${toISODate(s.due_date)}"/></div>
    <div class="form-group full"><div class="form-label">Project (optional)</div><select class="form-input" id="sob-project">${projectOpts}</select></div>
    <div class="form-group full"><div class="form-label">Description (optional)</div><textarea class="form-input" id="sob-desc" rows="2" placeholder="Brief description of services billed">${escapeHtml(s.description || '')}</textarea></div>
  </div>

  <div style="margin-top:18px">
    <div style="font-size:12px;font-weight:600;color:var(--ink);margin-bottom:8px">Line Items</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="border-bottom:1px solid var(--border)">
          <th style="text-align:left;padding:4px 6px;font-weight:600;color:var(--ink-3)">Description</th>
          <th style="text-align:right;padding:4px 6px;font-weight:600;color:var(--ink-3);width:56px">Qty</th>
          <th style="text-align:right;padding:4px 6px;font-weight:600;color:var(--ink-3);width:100px">Unit Price</th>
          <th style="text-align:right;padding:4px 6px;font-weight:600;color:var(--ink-3);width:50px">VAT%</th>
          <th style="text-align:right;padding:4px 6px;font-weight:600;color:var(--ink-3);width:100px">Amount</th>
          <th style="width:24px"></th>
        </tr>
      </thead>
      <tbody id="sob-line-rows">
        ${items.map(item => sobLineItemRowHTML(item)).join('')}
      </tbody>
    </table>
    <button type="button" class="btn btn-ghost" style="margin-top:8px;font-size:11px;padding:4px 10px" onclick="addSOBRow()">+ Add Row</button>
    <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px">
      <div style="display:flex;justify-content:flex-end;gap:16px;font-size:12px"><span style="color:var(--ink-3)">Subtotal</span><span id="sob-subtotal" style="font-weight:600;min-width:100px;text-align:right">${hasItems ? formatCurrency(subtotal) : '—'}</span></div>
      <div style="display:flex;justify-content:flex-end;gap:16px;font-size:12px;margin-top:4px"><span style="color:var(--ink-3)">VAT</span><span id="sob-vat-display" style="min-width:100px;text-align:right">${hasItems ? formatCurrency(vatAmt) : '—'}</span></div>
      <div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-top:6px">
        <span style="font-size:12px;color:var(--ink-3)">Discount (₱)</span>
        <input class="form-input" id="sob-discount" type="number" value="${discount}" min="0" step="any" style="width:110px;font-size:12px;padding:4px 8px;text-align:right" oninput="recalcSOB()"/>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:16px;font-size:13px;margin-top:6px;font-weight:700"><span>Total</span><span id="sob-total-display" style="min-width:100px;text-align:right">${hasItems ? formatCurrency(total) : '—'}</span></div>
    </div>
  </div>

  <div style="margin-top:18px;border-top:1px solid var(--border);padding-top:14px">
    <div class="form-grid">
      <div class="form-group full"><div class="form-label">Payment Instructions (optional)</div><textarea class="form-input" id="sob-pay-instr" rows="2" placeholder="Bank transfer details, GCash, etc.">${escapeHtml(s.payment_instructions || '')}</textarea></div>
      <div class="form-group full"><div class="form-label">Notes (optional)</div><textarea class="form-input" id="sob-notes" rows="2" placeholder="Terms, remarks, etc.">${escapeHtml(s.notes || '')}</textarea></div>
      <div class="form-group"><div class="form-label">Prepared By</div><input class="form-input" id="sob-prepared-by" value="${escapeHtml(s.prepared_by || '')}" placeholder="Your name"/></div>
      <div class="form-group"><div class="form-label">Approved By</div><input class="form-input" id="sob-approved-by" value="${escapeHtml(s.approved_by || '')}" placeholder="Approver name"/></div>
    </div>
  </div>`;
}

export function renderSOB(sobs: SOB[]) {
  const visible = _showArchivedSOBs
    ? sobs.filter(s => s.archived_at)
    : sobs.filter(s => !s.archived_at);
  const total    = visible.reduce((sum, s) => sum + (s.total_amount || 0), 0);
  const converted = visible.filter(s => s.linked_invoice_id).length;
  const archivedCount = sobs.filter(s => s.archived_at).length;

  const summaryEl = document.getElementById('sob-summary');
  if (summaryEl) {
    summaryEl.textContent = `${visible.length} billing statement${visible.length !== 1 ? 's' : ''} · ${formatCurrency(total)} total · ${converted} converted to invoice`;
  }

  const toggleBtn = document.getElementById('sob-archive-toggle');
  if (toggleBtn) toggleBtn.textContent = _showArchivedSOBs ? 'Hide Archived' : `Archived (${archivedCount})`;

  const tbody = document.getElementById('sob-tbody');
  if (!tbody) return;

  tbody.innerHTML = visible.length
    ? visible.map(s => {
        const isArchived  = !!s.archived_at;
        const canConvert  = !s.linked_invoice_id && !['Paid', 'Cancelled'].includes(s.status) && !isArchived;
        const linkedInv   = s.linked_invoice_id ? _invoices.find(i => i.id === s.linked_invoice_id) : null;
        const proj        = s.project_id ? _projects.find(p => p.id === s.project_id) : null;
        const convertBtn  = canConvert
          ? `<button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--gold)" onclick="convertSOBToInvoice(${s.id})">→ Invoice</button>`
          : linkedInv
            ? `<span style="font-size:10px;color:var(--green)">Invoice ${escapeHtml(linkedInv.or_num)}</span>`
            : '';
        const archiveBtn = isArchived
          ? `<button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--ink-3)" onclick="restoreSOB(${s.id})">Restore</button>`
          : `<button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--ink-3)" onclick="archiveSOB(${s.id})">Archive</button>`;
        return `
        <tr${isArchived ? ' style="opacity:0.6"' : ''}>
          <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(s.sob_num)}</td>
          <td style="font-weight:500;color:var(--ink)">${escapeHtml(s.client ?? '—')}</td>
          <td style="font-size:11px;color:var(--ink-3)">${proj ? escapeHtml(proj.name) : '—'}</td>
          <td class="amount-cell">${formatCurrency(s.total_amount)}</td>
          <td style="font-size:11px;color:var(--ink-3)">${displayDate(s.issue_date)}</td>
          <td style="font-size:11px;color:var(--ink-3)">${displayDate(s.due_date)}</td>
          <td><span class="badge badge-${statusClass(s.status)}">${escapeHtml(s.status)}</span></td>
          <td>
            <div class="flex-gap" style="gap:4px;flex-wrap:wrap">
              ${convertBtn}
              <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="openEditSOB(${s.id})">Edit</button>
              <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="openDuplicateSOB(${s.id})">Duplicate</button>
              ${archiveBtn}
              <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--red)" onclick="handleDeleteSOB(${s.id})">Delete</button>
            </div>
          </td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="8"><div class="empty-state">${_showArchivedSOBs ? 'No archived billing statements' : 'No billing statements yet'}</div></td></tr>`;
}

export function toggleArchivedSOBs() {
  _showArchivedSOBs = !_showArchivedSOBs;
  renderSOB(_sobs);
}

export function openAddSOB() {
  _editingSOBId = null;
  openModal('New Statement of Billing', sobFormHTML(), saveSOB);
}

export async function openEditSOB(id: number) {
  const s = _sobs.find(x => x.id === id);
  if (!s) return;
  _editingSOBId = id;
  const items = await fetchSOBLineItems(id);
  openModal('Edit Statement of Billing', sobFormHTML(s, items), saveSOB);
}

export async function openDuplicateSOB(id: number) {
  const original = _sobs.find(x => x.id === id);
  if (!original) return;
  const items = await fetchSOBLineItems(id);
  _editingSOBId = null;
  const draft: Partial<SOB> = {
    client:               original.client,
    project_id:           original.project_id,
    description:          original.description,
    subtotal:             original.subtotal,
    discount:             original.discount,
    vat_amount:           original.vat_amount,
    total_amount:         original.total_amount,
    payment_instructions: original.payment_instructions,
    notes:                original.notes,
    prepared_by:          original.prepared_by,
    approved_by:          original.approved_by,
    status:               'Draft',
  };
  openModal('Duplicate Statement of Billing', sobFormHTML(draft, items), saveSOB);
  toast('Duplicated — enter a new SOB number and save', '');
}

export async function saveSOB() {
  const sob_num = (document.getElementById('sob-num') as HTMLInputElement).value.trim();
  const err = validateRequired(sob_num, 'SOB number');
  if (err) { toast(err, 'error'); return; }

  const rows = document.querySelectorAll<HTMLTableRowElement>('#sob-line-rows .sob-li-row');
  const lineItems: SOBLineItem[] = [];
  rows.forEach(row => {
    const description = (row.querySelector('.sob-li-desc') as HTMLInputElement).value.trim();
    const quantity    = +(row.querySelector('.sob-li-qty')   as HTMLInputElement).value || 1;
    const unit_price  = +(row.querySelector('.sob-li-price') as HTMLInputElement).value || 0;
    const vat_rate    = +(row.querySelector('.sob-li-vat')   as HTMLInputElement).value || 0;
    if (description) lineItems.push({ description, quantity, unit_price, vat_rate });
  });

  const subtotal  = lineItems.reduce((sum, li) => sum + li.quantity * li.unit_price, 0);
  const vatAmount = lineItems.reduce((sum, li) => sum + li.quantity * li.unit_price * li.vat_rate / 100, 0);
  const discount  = +(document.getElementById('sob-discount') as HTMLInputElement).value || 0;
  const total     = subtotal + vatAmount - discount;

  const projVal = (document.getElementById('sob-project') as HTMLSelectElement).value;
  const payload: Partial<SOB> = {
    sob_num,
    client:    (document.getElementById('sob-client') as HTMLInputElement).value.trim() || null,
    status:    (document.getElementById('sob-status') as HTMLSelectElement).value,
    issue_date: (document.getElementById('sob-issue') as HTMLInputElement).value || null,
    due_date:   (document.getElementById('sob-due')   as HTMLInputElement).value || null,
    subtotal,
    vat_amount:  vatAmount,
    discount,
    total_amount: lineItems.length > 0 ? total : 0,
  };
  if (projVal) payload.project_id = +projVal;

  const description    = (document.getElementById('sob-desc')        as HTMLTextAreaElement).value.trim();
  const payInstr       = (document.getElementById('sob-pay-instr')   as HTMLTextAreaElement).value.trim();
  const notes          = (document.getElementById('sob-notes')        as HTMLTextAreaElement).value.trim();
  const preparedBy     = (document.getElementById('sob-prepared-by') as HTMLInputElement).value.trim();
  const approvedBy     = (document.getElementById('sob-approved-by') as HTMLInputElement).value.trim();
  if (description) payload.description           = description;
  if (payInstr)    payload.payment_instructions  = payInstr;
  if (notes)       payload.notes                 = notes;
  if (preparedBy)  payload.prepared_by           = preparedBy;
  if (approvedBy)  payload.approved_by           = approvedBy;

  let sobId = _editingSOBId;
  if (sobId) {
    const ok = await updateSOB(sobId, payload);
    if (!ok) { toast('Could not update billing statement', 'error'); return; }
    toast('Billing statement updated', 'success');
  } else {
    const result = await createSOB(payload);
    if (!result) { toast('Could not create billing statement. Please try again.', 'error'); return; }
    sobId = result.id;
    toast('Billing statement created', 'success');
  }

  if (sobId && lineItems.length) {
    await upsertSOBLineItems(sobId, lineItems);
  }

  closeModal();
  const fresh = await fetchSOBs();
  setSOBs(fresh);
  renderSOB(fresh);
}

export async function handleDeleteSOB(id: number) {
  if (!confirm('Delete this billing statement? This cannot be undone.')) return;
  const ok = await deleteSOB(id);
  if (!ok) { toast('Could not delete billing statement', 'error'); return; }
  toast('Billing statement deleted', '');
  const fresh = await fetchSOBs();
  setSOBs(fresh);
  renderSOB(fresh);
}

export async function archiveSOB(id: number) {
  const ok = await updateSOB(id, { archived_at: new Date().toISOString() } as Partial<SOB>);
  if (!ok) { toast('Could not archive billing statement', 'error'); return; }
  toast('Billing statement archived', '');
  const fresh = await fetchSOBs();
  setSOBs(fresh);
  renderSOB(fresh);
}

export async function restoreSOB(id: number) {
  const ok = await updateSOB(id, { archived_at: null } as Partial<SOB>);
  if (!ok) { toast('Could not restore billing statement', 'error'); return; }
  toast('Billing statement restored', '');
  const fresh = await fetchSOBs();
  setSOBs(fresh);
  renderSOB(fresh);
}

export async function convertSOBToInvoice(id: number) {
  const sob = _sobs.find(x => x.id === id);
  if (!sob) return;
  if (sob.linked_invoice_id) {
    toast('This SOB is already linked to an invoice', 'error');
    return;
  }
  const sobItems = await fetchSOBLineItems(id);
  const lineItems: InvoiceLineItem[] = sobItems.map(({ description, quantity, unit_price, vat_rate }) => ({
    description, quantity, unit_price, vat_rate,
  }));
  window.openInvoiceFromSOB({
    client:     sob.client,
    amount:     sob.total_amount,
    status:     'Draft',
    date:       sob.issue_date,
    due:        sob.due_date,
    project_id: sob.project_id,
    notes:      sob.notes,
    subtotal:   sob.subtotal,
    vat_amount: sob.vat_amount,
    discount:   sob.discount,
  }, lineItems, id);
}

export function addSOBRow() {
  const tbody = document.getElementById('sob-line-rows');
  if (!tbody) return;
  tbody.insertAdjacentHTML('beforeend', sobLineItemRowHTML());
  recalcSOB();
}

export function recalcSOB() {
  const rows = document.querySelectorAll<HTMLTableRowElement>('#sob-line-rows .sob-li-row');
  let subtotal = 0;
  let vatTotal = 0;
  rows.forEach(row => {
    const qty   = +(row.querySelector('.sob-li-qty')   as HTMLInputElement).value || 0;
    const price = +(row.querySelector('.sob-li-price') as HTMLInputElement).value || 0;
    const vat   = +(row.querySelector('.sob-li-vat')   as HTMLInputElement).value || 0;
    const lineSub = qty * price;
    const lineVat = lineSub * vat / 100;
    subtotal += lineSub;
    vatTotal += lineVat;
    const amtCell = row.querySelector('.sob-li-amt');
    if (amtCell) amtCell.textContent = formatCurrency(lineSub + lineVat);
  });
  const discountEl = document.getElementById('sob-discount') as HTMLInputElement | null;
  const discount = discountEl ? +discountEl.value || 0 : 0;
  const total = subtotal + vatTotal - discount;
  const stEl  = document.getElementById('sob-subtotal');
  const vatEl = document.getElementById('sob-vat-display');
  const totEl = document.getElementById('sob-total-display');
  if (stEl)  stEl.textContent  = formatCurrency(subtotal);
  if (vatEl) vatEl.textContent = formatCurrency(vatTotal);
  if (totEl) totEl.textContent = formatCurrency(total);
}

// Extend Window to include the cross-module SOB→Invoice bridge
declare global {
  interface Window {
    openInvoiceFromSOB: (draft: Partial<import('../../shared/types.ts').Invoice>, items: InvoiceLineItem[], sobId: number) => void;
  }
}
