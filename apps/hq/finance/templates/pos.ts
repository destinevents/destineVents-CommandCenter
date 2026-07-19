import type { PurchaseOrder, POLineItem, Project } from '@shared/types.ts';
import { escapeHtml } from '@shared/utils/helpers.ts';
import { formatCurrency } from '@shared/utils/formatUtils.ts';
import { formatDateShort } from '@shared/utils/dateUtils.ts';

export const PO_STATUSES = ['Draft', 'Sent', 'Approved', 'Fulfilled', 'Cancelled'];
export const PO_STATUS_CLASS: Record<string, string> = {
  'Draft':     'draft',
  'Sent':      'sent',
  'Approved':  'ap-approved',
  'Fulfilled': 'paid',
  'Cancelled': 'cancelled',
};

export function poRowHTML(po: PurchaseOrder, projects: Project[]): string {
  const proj     = projects.find(p => p.id === po.project_id);
  const projName = proj ? escapeHtml(proj.name) : '—';
  const statusCls = PO_STATUS_CLASS[po.status] ?? 'draft';

  let actions = '';
  if (po.status === 'Draft') {
    actions = `
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="openEditPO(${po.id})">Edit</button>
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--blue)" onclick="sendPO(${po.id})">Send</button>
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="printPO(${po.id})">PDF</button>
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--red)" onclick="handleDeletePO(${po.id})">Delete</button>`;
  } else if (po.status === 'Sent') {
    actions = `
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--green)" onclick="approvePO(${po.id})">Approve</button>
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="printPO(${po.id})">PDF</button>
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--red)" onclick="cancelPO(${po.id})">Cancel</button>`;
  } else if (po.status === 'Approved') {
    actions = `
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--green)" onclick="markPOFulfilled(${po.id})">Mark Fulfilled</button>
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="printPO(${po.id})">PDF</button>`;
  } else if (po.status === 'Fulfilled') {
    actions = `
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="printPO(${po.id})">PDF</button>
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--ink-3)" onclick="archivePO(${po.id})">Archive</button>`;
  } else if (po.status === 'Cancelled') {
    actions = `
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--ink-3)" onclick="archivePO(${po.id})">Archive</button>`;
  }

  return `<tr>
    <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(po.po_number)}</td>
    <td style="font-weight:500;color:var(--ink)">${escapeHtml(po.vendor)}</td>
    <td style="font-size:11px;color:var(--ink-3)">${projName}</td>
    <td style="font-size:11px;color:var(--ink-3)">${po.issue_date ? formatDateShort(po.issue_date) : '—'}</td>
    <td style="font-size:11px;color:var(--ink-3)">${po.delivery_date ? formatDateShort(po.delivery_date) : '—'}</td>
    <td class="amount-cell">${formatCurrency(po.total_amount)}</td>
    <td><span class="badge badge-${statusCls}">${escapeHtml(po.status)}</span></td>
    <td><div class="flex-gap" style="gap:4px">${actions}</div></td>
  </tr>`;
}

export function poLineRowHTML(item: Partial<POLineItem> = {}): string {
  return `<tr class="po-li-row">
    <td style="padding:3px 4px"><input class="form-input po-li-desc" style="font-size:12px;padding:4px 6px" value="${escapeHtml(item.description || '')}" placeholder="Item description" oninput="recalcPO()"/></td>
    <td style="padding:3px 4px"><input class="form-input po-li-qty" style="font-size:12px;padding:4px 6px;text-align:right" type="number" value="${item.quantity ?? 1}" min="0" step="any" oninput="recalcPO()"/></td>
    <td style="padding:3px 4px"><input class="form-input po-li-price" style="font-size:12px;padding:4px 6px;text-align:right" type="number" value="${item.unit_price ?? 0}" min="0" step="any" oninput="recalcPO()"/></td>
    <td style="padding:3px 4px"><input class="form-input po-li-vat" style="font-size:12px;padding:4px 6px;text-align:right" type="number" value="${item.vat_rate ?? 0}" min="0" max="100" step="any" oninput="recalcPO()"/></td>
    <td style="padding:3px 4px;text-align:right;font-size:12px;color:var(--ink-2)" class="po-li-total">₱0.00</td>
    <td style="padding:3px 4px"><button type="button" class="btn btn-ghost" style="padding:2px 6px;font-size:11px;color:var(--red)" onclick="this.closest('tr').remove();recalcPO()">×</button></td>
  </tr>`;
}

export function poFormHTML(
  po: Partial<PurchaseOrder> = {},
  items: POLineItem[] = [],
  projects: Project[],
): string {
  const projOpts = `<option value="">— No project —</option>` +
    projects.map(p => `<option value="${p.id}"${po.project_id === p.id ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
  const statusOpts = PO_STATUSES.map(s => `<option${s === po.status ? ' selected' : ''}>${s}</option>`).join('');
  const lineRows = (items.length ? items : [{}]).map(poLineRowHTML).join('');

  return `<div class="form-grid">
    <div class="form-group"><div class="form-label">PO #</div><input class="form-input" id="fp-po-num" value="${escapeHtml(po.po_number ?? '')}" placeholder="Auto-generated" readonly/></div>
    <div class="form-group"><div class="form-label">Vendor *</div><input class="form-input" id="fp-vendor" value="${escapeHtml(po.vendor ?? '')}" placeholder="Supplier or vendor name" required/></div>
    <div class="form-group"><div class="form-label">Project (optional)</div><select class="form-input" id="fp-project">${projOpts}</select></div>
    <div class="form-group"><div class="form-label">Status</div><select class="form-input" id="fp-status">${statusOpts}</select></div>
    <div class="form-group"><div class="form-label">Issue Date</div><input class="form-input" id="fp-issue-date" type="date" value="${po.issue_date ?? ''}"/></div>
    <div class="form-group"><div class="form-label">Delivery Date</div><input class="form-input" id="fp-delivery-date" type="date" value="${po.delivery_date ?? ''}"/></div>
    <div class="form-group"><div class="form-label">Prepared By</div><input class="form-input" id="fp-prepared-by" value="${escapeHtml(po.prepared_by ?? '')}" placeholder="Name of preparer"/></div>
    <div class="form-group"><div class="form-label">Approved By</div><input class="form-input" id="fp-approved-by" value="${escapeHtml(po.approved_by ?? '')}" placeholder="Name of approver"/></div>
  </div>

  <div style="margin-top:16px">
    <div class="form-label" style="margin-bottom:6px">Line Items</div>
    <div style="border:1px solid var(--ink-4);overflow:hidden">
      <table class="ledger-table" style="font-size:12px">
        <thead><tr><th>Description</th><th style="width:80px;text-align:right">Qty</th><th style="width:110px;text-align:right">Unit Price</th><th style="width:80px;text-align:right">VAT %</th><th style="width:110px;text-align:right">Subtotal</th><th style="width:40px"></th></tr></thead>
        <tbody id="po-line-rows">${lineRows}</tbody>
      </table>
    </div>
    <button type="button" class="btn btn-ghost" style="margin-top:8px;font-size:11px;padding:4px 10px" onclick="addPORow()">+ Add Row</button>
  </div>

  <div style="margin-top:16px;display:grid;grid-template-columns:1fr auto;gap:16px;align-items:end">
    <div class="form-group full">
      <div class="form-label">Notes</div>
      <textarea class="form-input" id="fp-notes" rows="2" placeholder="Terms, delivery instructions, or any other notes">${escapeHtml(po.notes ?? '')}</textarea>
    </div>
    <div style="min-width:220px;background:var(--ink-5);border:1px solid var(--ink-4);padding:12px 16px;font-size:13px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:var(--ink-3)">Subtotal</span><span id="fp-subtotal">₱0.00</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:var(--ink-3)">VAT</span><span id="fp-vat">₱0.00</span></div>
      <div style="display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid var(--ink-4);font-weight:700"><span>Total</span><span id="fp-total">₱0.00</span></div>
    </div>
  </div>
  <script>setTimeout(recalcPO, 0);</script>`;
}
