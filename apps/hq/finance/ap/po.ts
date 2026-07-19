import { formatCurrency } from '@shared/utils/formatUtils.ts';
import { escapeHtml } from '@shared/utils/helpers.ts';
import { validateRequired } from '@shared/utils/validators.ts';
import { APP_SETTINGS } from '@config/settings.ts';
import { nextDocNumber } from '@shared/services/documents/docNumberService.ts';
import { logDocActivity } from '@shared/services/documents/activityLogService.ts';
import { getCurrentUser } from '@shared/core/authService.ts';
import { buildDocPDF, docPDFLineItemsTable, docPDFTotals } from '@shared/documents/pdfTemplate.ts';
import { openDocEmail } from '@shared/documents/docEmail.ts';
import {
  fetchPOLineItems, createPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder,
} from '@shared/services/documents/poService.ts';
import {
  PO_STATUSES, PO_STATUS_CLASS, poRowHTML, poLineRowHTML, poFormHTML,
} from '../templates/pos.ts';
import { paginationBar } from '../templates/invoices.ts';
import { _pos, _projects } from '@hq/core/state.ts';
import { toast, openModal, closeModal } from '@hq/core/ui.ts';
import type { PurchaseOrder, POLineItem } from '@shared/types.ts';
import { loadFinance } from '../finance.ts';

// ── PO module-level state ─────────────────────────────────────────────────────
let _editingPOId: number | null = null;
let _poFilterStatus             = '';
let _poFilterSearch             = '';
let _poPage                     = 1;
const PO_PAGE_SIZE              = 20;

// ── Render ────────────────────────────────────────────────────────────────────

export function setPOFilter() {
  _poFilterStatus = (document.getElementById('po-filter-status') as HTMLSelectElement | null)?.value ?? '';
  _poFilterSearch = (document.getElementById('po-filter-search') as HTMLInputElement  | null)?.value.toLowerCase() ?? '';
  _poPage = 1;
  renderPO(_pos);
}

export function clearPOFilters() {
  _poFilterStatus = '';
  _poFilterSearch = '';
  _poPage = 1;
  renderPO(_pos);
}

export function setPOPage(p: number) {
  _poPage = p;
  renderPO(_pos);
}

export function renderPO(pos: PurchaseOrder[]) {
  const container = document.getElementById('ptab-po');
  if (!container) return;

  const active = pos.filter(p => !p.archived_at);

  const draftPOs     = active.filter(p => p.status === 'Draft');
  const sentPOs      = active.filter(p => p.status === 'Sent');
  const approvedPOs  = active.filter(p => p.status === 'Approved');
  const fulfilledPOs = active.filter(p => p.status === 'Fulfilled');

  let filtered = active;
  if (_poFilterStatus) filtered = filtered.filter(p => p.status === _poFilterStatus);
  if (_poFilterSearch) filtered = filtered.filter(p =>
    p.vendor.toLowerCase().includes(_poFilterSearch) ||
    p.po_number.toLowerCase().includes(_poFilterSearch)
  );

  const hasFilters = !!(_poFilterStatus || _poFilterSearch);
  const total      = filtered.length;
  const paged      = filtered.slice((_poPage - 1) * PO_PAGE_SIZE, _poPage * PO_PAGE_SIZE);

  const sumOf = (arr: PurchaseOrder[]) => arr.reduce((s, p) => s + p.total_amount, 0);

  container.innerHTML = `
    <div class="finance-stat-grid" style="margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">Draft</div>
        <div class="stat-value" style="font-size:22px">${draftPOs.length}</div>
        <div class="stat-change">${formatCurrency(sumOf(draftPOs))}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Sent / Pending Approval</div>
        <div class="stat-value" style="font-size:22px;color:var(--amber)">${sentPOs.length}</div>
        <div class="stat-change">${formatCurrency(sumOf(sentPOs))}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Approved</div>
        <div class="stat-value" style="font-size:22px;color:var(--blue)">${formatCurrency(sumOf(approvedPOs))}</div>
        <div class="stat-change">${approvedPOs.length} order${approvedPOs.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Fulfilled</div>
        <div class="stat-value" style="font-size:22px;color:var(--green)">${fulfilledPOs.length}</div>
        <div class="stat-change">${formatCurrency(sumOf(fulfilledPOs))}</div>
      </div>
    </div>

    <div class="page-actions" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;gap:8px;flex:1;flex-wrap:wrap;align-items:center">
        <input class="form-input" id="po-filter-search" placeholder="Search vendor or PO #…" value="${escapeHtml(_poFilterSearch)}" oninput="setPOFilter()" style="width:220px"/>
        <select class="form-input" id="po-filter-status" onchange="setPOFilter()" style="width:160px">
          <option value="">All Statuses</option>
          ${PO_STATUSES.map(s => `<option${_poFilterStatus === s ? ' selected' : ''}>${escapeHtml(s)}</option>`).join('')}
        </select>
        ${hasFilters ? `<button class="btn btn-ghost" onclick="clearPOFilters()" style="font-size:12px">Clear filters</button>` : ''}
      </div>
      <button class="btn btn-primary" onclick="openAddPO()">+ New Purchase Order</button>
    </div>

    <div style="border:1px solid var(--ink-4);overflow:hidden">
      <table class="ledger-table">
        <thead>
          <tr>
            <th>PO #</th>
            <th>Vendor</th>
            <th>Project</th>
            <th>Issue Date</th>
            <th>Delivery Date</th>
            <th>Total</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${paged.length
            ? paged.map(po => poRowHTML(po, _projects)).join('')
            : `<tr><td colspan="8"><div class="empty-state">${hasFilters ? 'No purchase orders match filters' : 'No purchase orders yet'}</div></td></tr>`}
        </tbody>
      </table>
      ${paginationBar(_poPage, total, PO_PAGE_SIZE, 'setPOPage')}
    </div>`;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function openAddPO() {
  _editingPOId = null;
  const poNum = nextDocNumber('PO', _pos.map(p => p.po_number));
  const user = await getCurrentUser();
  openModal(
    'New Purchase Order',
    poFormHTML({ po_number: poNum, status: 'Draft', prepared_by: user?.name ?? '' }, [], _projects),
    savePO,
  );
}

export async function openEditPO(id: number) {
  const po = _pos.find(p => p.id === id);
  if (!po) return;
  _editingPOId = id;
  const items = await fetchPOLineItems(id);
  openModal('Edit Purchase Order', poFormHTML(po, items, _projects), savePO);
}

export async function savePO() {
  const vendor = (document.getElementById('fp-vendor') as HTMLInputElement).value.trim();
  const err = validateRequired(vendor, 'Vendor');
  if (err) { toast(err, 'error'); return; }

  const projVal = (document.getElementById('fp-project') as HTMLSelectElement).value;
  const poNum   = (document.getElementById('fp-po-num')  as HTMLInputElement).value.trim()
    || nextDocNumber('PO', _pos.map(p => p.po_number));

  const rows = _collectPORows();
  const subtotal   = rows.reduce((s, r) => s + r.quantity * r.unit_price, 0);
  const vatAmount  = rows.reduce((s, r) => s + r.quantity * r.unit_price * (r.vat_rate / 100), 0);
  const totalAmount = subtotal + vatAmount;

  const payload: Partial<PurchaseOrder> = {
    po_number:     poNum,
    vendor,
    project_id:    projVal ? +projVal : null,
    issue_date:    (document.getElementById('fp-issue-date')    as HTMLInputElement).value   || null,
    delivery_date: (document.getElementById('fp-delivery-date') as HTMLInputElement).value   || null,
    prepared_by:   (document.getElementById('fp-prepared-by')   as HTMLInputElement).value.trim() || null,
    approved_by:   (document.getElementById('fp-approved-by')   as HTMLInputElement).value.trim() || null,
    notes:         (document.getElementById('fp-notes')         as HTMLTextAreaElement).value.trim() || null,
    status:        (document.getElementById('fp-status')        as HTMLSelectElement).value,
    subtotal,
    vat_amount:    vatAmount,
    total_amount:  totalAmount,
  };

  const user  = await getCurrentUser();
  const actor = user?.name ?? user?.email ?? null;

  if (_editingPOId) {
    const ok = await updatePurchaseOrder(_editingPOId, payload);
    if (!ok) { toast('Could not update purchase order', 'error'); return; }
    await _saveLineItems(_editingPOId, rows);
    toast('Purchase order updated', 'success');
    await logDocActivity('po', _editingPOId, poNum, 'updated', actor);
  } else {
    const result = await createPurchaseOrder(payload);
    if (!result) { toast('Could not create purchase order. Please try again.', 'error'); return; }
    await _saveLineItems(result.id, rows);
    toast('Purchase order created', 'success');
    await logDocActivity('po', result.id, poNum, 'created', actor);
  }

  closeModal();
  loadFinance();
}

async function _saveLineItems(poId: number, rows: POLineItem[]) {
  const { upsertPOLineItems } = await import('@shared/services/documents/poService.ts');
  await upsertPOLineItems(poId, rows);
}

function _collectPORows(): POLineItem[] {
  return Array.from(document.querySelectorAll<HTMLTableRowElement>('#po-line-rows .po-li-row'))
    .map(row => ({
      description: (row.querySelector('.po-li-desc')  as HTMLInputElement).value.trim(),
      quantity:    parseFloat((row.querySelector('.po-li-qty')   as HTMLInputElement).value) || 0,
      unit_price:  parseFloat((row.querySelector('.po-li-price') as HTMLInputElement).value) || 0,
      vat_rate:    parseFloat((row.querySelector('.po-li-vat')   as HTMLInputElement).value) || 0,
    }))
    .filter(r => r.description);
}

export function addPORow() {
  const tbody = document.getElementById('po-line-rows');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = poLineRowHTML().replace('<tr class="po-li-row">', '').replace('</tr>', '');
  tr.className = 'po-li-row';
  tbody.appendChild(tr);
  recalcPO();
}

export function recalcPO() {
  const rows = document.querySelectorAll<HTMLTableRowElement>('#po-line-rows .po-li-row');
  let subtotal = 0;
  let vat      = 0;

  rows.forEach(row => {
    const qty      = parseFloat((row.querySelector('.po-li-qty')   as HTMLInputElement)?.value ?? '0') || 0;
    const price    = parseFloat((row.querySelector('.po-li-price') as HTMLInputElement)?.value ?? '0') || 0;
    const vatRate  = parseFloat((row.querySelector('.po-li-vat')   as HTMLInputElement)?.value ?? '0') || 0;
    const lineAmt  = qty * price;
    const lineVat  = lineAmt * (vatRate / 100);
    subtotal += lineAmt;
    vat      += lineVat;
    const totalCell = row.querySelector('.po-li-total');
    if (totalCell) totalCell.textContent = `₱${(lineAmt + lineVat).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
  });

  const total = subtotal + vat;
  const fmt = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
  const sub = document.getElementById('fp-subtotal'); if (sub) sub.textContent = fmt(subtotal);
  const v   = document.getElementById('fp-vat');       if (v)   v.textContent   = fmt(vat);
  const tot = document.getElementById('fp-total');     if (tot) tot.textContent = fmt(total);
}

// ── Status transitions ────────────────────────────────────────────────────────

export function sendPO(id: number) {
  const po = _pos.find(p => p.id === id);
  if (!po) return;
  const { company } = APP_SETTINGS;
  openDocEmail({
    modalTitle:     'Send Purchase Order',
    docSummary:     `${po.po_number} · ${po.vendor} · ${formatCurrency(po.total_amount)}`,
    defaultSubject: `Purchase Order from ${company.name}`,
    defaultBody:    `Dear ${po.vendor},\n\nPlease find attached our Purchase Order ${po.po_number}.\n\nKindly confirm receipt and expected delivery date.\n\nThank you,\n${company.name}`,
    pdfHint:        'Download the PDF first to attach it to your email.',
    onSend: async () => {
      const ok = await updatePurchaseOrder(id, { status: 'Sent' });
      if (!ok) { toast('Could not update status', 'error'); return; }
      toast('Purchase Order sent', 'success');
      const user = await getCurrentUser();
      await logDocActivity('po', id, po.po_number, 'sent', user?.name ?? user?.email ?? null);
      loadFinance();
    },
  });
}

export async function approvePO(id: number) {
  const po = _pos.find(p => p.id === id);
  if (!po) return;
  openModal('Approve Purchase Order', `
    <div style="margin-bottom:14px;font-size:13px;color:var(--ink-2)">
      Approving PO <strong>${escapeHtml(po.po_number)}</strong> for <strong>${escapeHtml(po.vendor)}</strong><br>
      <span style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:700;color:var(--ink)">${formatCurrency(po.total_amount)}</span>
    </div>
    <div class="form-grid">
      <div class="form-group full">
        <div class="form-label">Approved By *</div>
        <input class="form-input" id="po-approver" value="${escapeHtml(po.approved_by ?? '')}" placeholder="Name of approver"/>
      </div>
    </div>`,
    async () => {
      const approver = (document.getElementById('po-approver') as HTMLInputElement).value.trim();
      if (!approver) { toast('Approver name is required', 'error'); return; }
      const ok = await updatePurchaseOrder(id, { status: 'Approved', approved_by: approver });
      if (!ok) { toast('Could not approve PO', 'error'); return; }
      toast('Purchase Order approved', 'success');
      await logDocActivity('po', id, po.po_number, 'approved', approver);
      closeModal();
      loadFinance();
    },
    'Approve',
  );
}

export async function markPOFulfilled(id: number) {
  if (!confirm('Mark this Purchase Order as Fulfilled?')) return;
  const po = _pos.find(p => p.id === id);
  const ok = await updatePurchaseOrder(id, { status: 'Fulfilled' });
  if (!ok) { toast('Could not update status', 'error'); return; }
  toast('Purchase Order marked as Fulfilled', 'success');
  const user = await getCurrentUser();
  await logDocActivity('po', id, po?.po_number ?? null, 'fulfilled', user?.name ?? user?.email ?? null);
  loadFinance();
}

export async function cancelPO(id: number) {
  if (!confirm('Cancel this Purchase Order?')) return;
  const po = _pos.find(p => p.id === id);
  const ok = await updatePurchaseOrder(id, { status: 'Cancelled' });
  if (!ok) { toast('Could not cancel PO', 'error'); return; }
  toast('Purchase Order cancelled', '');
  const user = await getCurrentUser();
  await logDocActivity('po', id, po?.po_number ?? null, 'cancelled', user?.name ?? user?.email ?? null);
  loadFinance();
}

export async function archivePO(id: number) {
  if (!confirm('Archive this Purchase Order? It will be hidden from the main view.')) return;
  const po = _pos.find(p => p.id === id);
  const ok = await updatePurchaseOrder(id, { archived_at: new Date().toISOString() } as Partial<PurchaseOrder>);
  if (!ok) { toast('Could not archive PO', 'error'); return; }
  toast('Purchase Order archived', '');
  const user = await getCurrentUser();
  await logDocActivity('po', id, po?.po_number ?? null, 'archived', user?.name ?? user?.email ?? null);
  loadFinance();
}

export async function handleDeletePO(id: number) {
  if (!confirm('Delete this Purchase Order? This cannot be undone.')) return;
  const ok = await deletePurchaseOrder(id);
  if (!ok) { toast('Could not delete purchase order', 'error'); return; }
  toast('Purchase Order deleted', '');
  loadFinance();
}

// ── PDF ───────────────────────────────────────────────────────────────────────

export async function printPO(id: number) {
  const po = _pos.find(p => p.id === id);
  if (!po) return;
  const { company } = APP_SETTINGS;
  const items      = await fetchPOLineItems(id);
  const proj       = _projects.find(p => p.id === po.project_id);
  const statusCls  = PO_STATUS_CLASS[po.status] ?? 'draft';

  const docItems = items.map(i => ({
    description: i.description,
    quantity:    i.quantity,
    unit_price:  i.unit_price,
    vat_rate:    i.vat_rate,
  }));

  const body = `
<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px">
  <div>
    <div class="label">Vendor</div>
    <div class="value" style="font-weight:600">${escapeHtml(po.vendor)}</div>
    ${proj ? `<div class="label">Project</div><div class="value">${escapeHtml(proj.name)}</div>` : ''}
    ${po.notes ? `<div class="label">Notes</div><div class="value">${escapeHtml(po.notes)}</div>` : ''}
  </div>
  <div>
    ${po.issue_date    ? `<div class="label">Issue Date</div><div class="value">${po.issue_date}</div>` : ''}
    ${po.delivery_date ? `<div class="label">Delivery Date</div><div class="value">${po.delivery_date}</div>` : ''}
  </div>
</div>
<hr class="divider"/>
${docPDFLineItemsTable(docItems)}
<hr class="divider"/>
${docPDFTotals({ subtotal: po.subtotal, vat: po.vat_amount, total: po.total_amount })}`;

  const html = buildDocPDF({
    title:       'PURCHASE ORDER',
    number:      po.po_number,
    status:      po.status,
    statusClass: statusCls,
    company:     { name: company.name, address: company.address, email: company.email },
    body,
    sigLeft:  po.prepared_by ? { label: 'Prepared By', name: po.prepared_by } : { label: 'Prepared By' },
    sigRight: po.approved_by ? { label: 'Approved By', name: po.approved_by } : { label: 'Approved By' },
    showTin: true,
  });

  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) { toast('Pop-up blocked — please allow pop-ups and try again', 'error'); return; }
  try {
    w.document.write(html);
    w.document.close();
    const user = await getCurrentUser();
    await logDocActivity('po', id, po.po_number, 'downloaded', user?.name ?? user?.email ?? null);
  } catch (error) {
    console.error('printPO failed:', error);
    w.close();
    toast('Could not generate PDF. Please try again.', 'error');
  }
}
