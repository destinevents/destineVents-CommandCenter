import type { Invoice, InvoiceLineItem, Client, Project, SOB } from '@shared/types.ts';
import { escapeHtml, statusClass } from '@shared/utils/helpers.ts';
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

// ── Pagination ────────────────────────────────────────────────────────────────

export function paginationBar(page: number, total: number, size: number, fn: string): string {
  if (total <= size) return '';
  const pages = Math.ceil(total / size);
  const from  = (page - 1) * size + 1;
  const to    = Math.min(page * size, total);
  return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-top:1px solid var(--ink-4);font-size:11px;color:var(--ink-3)"><span>${from}–${to} of ${total}</span><div style="display:flex;gap:6px;align-items:center"><button class="btn btn-ghost" style="padding:3px 10px;font-size:11px" ${page <= 1 ? 'disabled' : `onclick="${fn}(${page - 1})"`}>← Prev</button><span style="color:var(--ink-2);padding:0 2px">${page} / ${pages}</span><button class="btn btn-ghost" style="padding:3px 10px;font-size:11px" ${page >= pages ? 'disabled' : `onclick="${fn}(${page + 1})"`}>Next →</button></div></div>`;
}

// ── Invoice row ───────────────────────────────────────────────────────────────

export function invoiceRowHTML(i: Invoice, sobs: SOB[], bpiEnabled: boolean): string {
  const isActive   = !['Paid', 'Cancelled'].includes(i.status);
  const isArchived = !!i.archived_at;
  const payMethodBadge = i.status === 'Paid' && i.payment_method
    ? `<span style="font-size:10px;color:var(--ink-3);margin-left:4px">${escapeHtml(i.payment_method)}</span>`
    : '';
  const linkedSOB  = sobs.find(s => s.linked_invoice_id === i.id);
  const sobBadge   = linkedSOB
    ? `<div style="font-size:9px;color:var(--ink-3);margin-top:1px">from ${escapeHtml(linkedSOB.sob_num)}</div>`
    : '';
  const primaryBtns = isArchived ? '' :
    isActive
      ? `<button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--green)" onclick="openRecordPayment(${i.id})">Record</button>`
      : i.status === 'Paid'
        ? `<button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--green)" onclick="printOfficialReceipt(${i.id})">Print OR</button>
           <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--ink-2)" onclick="openPaymentHistory(${i.id})">History</button>`
        : '';
  const emailBtnVis = !isArchived
    ? `<button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--blue)" onclick="sendInvoiceEmail(${i.id})">Email</button>`
    : '';
  const payLinkItem = isActive
    ? i.payment_url
      ? `<a href="${escapeHtml(i.payment_url)}" target="_blank" rel="noopener">Copy Pay Link</a>`
      : `<button onclick="openPaymentLink(${i.id},${i.amount},'${escapeHtml(i.client ?? '')}','${escapeHtml(i.or_num)}')">Pay Link</button>`
    : '';
  const bpiItem = isActive && bpiEnabled
    ? `<button onclick="openBpiQr(${i.id},${i.amount},'${escapeHtml(i.client ?? '')}','${escapeHtml(i.or_num)}')">BPI QR</button>`
    : '';
  const moreItems = isArchived
    ? `<button onclick="restoreInvoice(${i.id})">Restore</button>
       <div class="action-menu-sep"></div>
       <button class="menu-danger" onclick="handleDeleteInvoice(${i.id})">Delete</button>`
    : [
        payLinkItem, bpiItem,
        `<button onclick="printInvoice(${i.id})">Print Invoice</button>`,
        `<button onclick="openDuplicateInvoice(${i.id})">Duplicate</button>`,
        `<button onclick="openEditInvoice(${i.id})">Edit</button>`,
        `<button onclick="openDocActivityLog('invoice',${i.id},'${escapeHtml(i.or_num)}')">Activity Log</button>`,
        `<div class="action-menu-sep"></div>`,
        `<button onclick="archiveInvoice(${i.id})">Archive</button>`,
        `<button class="menu-danger" onclick="handleDeleteInvoice(${i.id})">Delete</button>`,
      ].filter(Boolean).join('');
  return `
  <tr${isArchived ? ' style="opacity:0.6"' : ''}>
    <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(i.or_num)}${sobBadge}</td>
    <td style="font-weight:500;color:var(--ink)">${escapeHtml(i.client)}</td>
    <td class="amount-cell">${formatCurrency(i.amount)}</td>
    <td style="font-size:11px;color:var(--ink-3)">${displayDate(i.date)}</td>
    <td style="font-size:11px;color:var(--ink-3)">${displayDate(i.due)}</td>
    <td><span class="badge badge-${statusClass(i.status)}">${escapeHtml(i.status)}</span>${payMethodBadge}</td>
    <td>
      <div class="flex-gap" style="gap:4px">
        ${primaryBtns}
        ${emailBtnVis}
        <div class="action-menu">
          <button class="action-menu-trigger" onclick="toggleActionMenu(this)">···</button>
          <div class="action-menu-dropdown">${moreItems}</div>
        </div>
      </div>
    </td>
  </tr>`;
}

// ── Line item row ─────────────────────────────────────────────────────────────

export function lineItemRowHTML(item: Partial<InvoiceLineItem> = {}): string {
  const lineTotal = (item.quantity ?? 1) * (item.unit_price ?? 0) * (1 + (item.vat_rate ?? 0) / 100);
  return `
    <tr class="li-row">
      <td style="padding:3px 4px"><input class="form-input li-desc" style="font-size:12px;padding:4px 6px" value="${escapeHtml(item.description || '')}" placeholder="Service / item" oninput="recalcInvoice()"/></td>
      <td style="padding:3px 4px"><input class="form-input li-qty" style="font-size:12px;padding:4px 6px;text-align:right" type="number" value="${item.quantity ?? 1}" min="0" step="any" oninput="recalcInvoice()"/></td>
      <td style="padding:3px 4px"><input class="form-input li-price" style="font-size:12px;padding:4px 6px;text-align:right" type="number" value="${item.unit_price ?? 0}" min="0" step="any" oninput="recalcInvoice()"/></td>
      <td style="padding:3px 4px"><input class="form-input li-vat" style="font-size:12px;padding:4px 6px;text-align:right" type="number" value="${item.vat_rate ?? 0}" min="0" max="100" step="any" oninput="recalcInvoice()"/></td>
      <td class="li-amt" style="padding:3px 4px;text-align:right;font-size:12px">${formatCurrency(lineTotal)}</td>
      <td style="padding:3px 4px"><button type="button" class="btn btn-ghost" style="padding:2px 6px;font-size:11px;color:var(--red)" onclick="this.closest('tr').remove();recalcInvoice()">×</button></td>
    </tr>`;
}

// ── Invoice form ──────────────────────────────────────────────────────────────

export function invoiceFormHTML(
  i: Partial<Invoice> = {},
  items: InvoiceLineItem[] = [],
  clients: Client[],
  projects: Project[],
): string {
  const clientOpts   = clients.map(c => `<option value="${escapeHtml(c.name)}"/>`).join('');
  const projectOpts  = `<option value="">— no project —</option>` +
    projects.map(p => `<option value="${p.id}"${i.project_id === p.id ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
  const hasItems     = items.length > 0;
  const subtotal     = items.reduce((s, li) => s + li.quantity * li.unit_price, 0);
  const vatAmt       = items.reduce((s, li) => s + li.quantity * li.unit_price * li.vat_rate / 100, 0);
  const total        = subtotal + vatAmt;
  const payMethodOpts = ['GCash', 'BPI', 'PayMongo', 'Cash', 'Check', 'Bank Transfer', 'Other']
    .map(m => `<option value="${m}"${i.payment_method === m ? ' selected' : ''}>${m}</option>`).join('');
  return `<datalist id="hq-client-list">${clientOpts}</datalist>
  <div class="form-grid">
    <div class="form-group"><div class="form-label">OR / Invoice Number</div><input class="form-input" id="fi-or" value="${escapeHtml(i.or_num || '')}" placeholder="OR-2026-005"/></div>
    <div class="form-group"><div class="form-label">Client</div><input class="form-input" id="fi-client" value="${escapeHtml(i.client || '')}" list="hq-client-list" placeholder="Client name" autocomplete="off"/></div>
    <div class="form-group"><div class="form-label">Amount (₱)</div><input class="form-input" id="fi-amount" type="number" value="${hasItems ? total : (i.amount || 0)}" ${hasItems ? 'readonly' : ''} placeholder="Auto-calculated from line items"/></div>
    <div class="form-group"><div class="form-label">Status</div>
      ${i.status === 'Paid'
        ? `<input class="form-input" id="fi-status" value="Paid" readonly style="color:var(--green);background:var(--linen-3);cursor:not-allowed" title="Use Record Payment to set an invoice as Paid"/>`
        : `<select class="form-input" id="fi-status" onchange="togglePaymentFields(this.value)">
        <option${i.status === 'Draft' || !i.status ? ' selected' : ''}>Draft</option>
        <option${i.status === 'Issued' || i.status === 'Unpaid' ? ' selected' : ''}>Issued</option>
        <option${i.status === 'Overdue' ? ' selected' : ''}>Overdue</option>
        <option${i.status === 'Cancelled' ? ' selected' : ''}>Cancelled</option>
      </select>`}
    </div>
    <div class="form-group"><div class="form-label">Date Issued</div><input class="form-input" id="fi-date" type="date" value="${toISODate(i.date)}"/></div>
    <div class="form-group"><div class="form-label">Due Date</div><input class="form-input" id="fi-due" type="date" value="${toISODate(i.due)}"/></div>
    <div class="form-group"><div class="form-label">Client TIN (optional)</div><input class="form-input" id="fi-tin" value="${escapeHtml(i.tin || '')}" placeholder="000-000-000-000"/></div>
    <div class="form-group"><div class="form-label">Business Address (optional)</div><input class="form-input" id="fi-address" value="${escapeHtml(i.business_address || '')}" placeholder="Client's business address"/></div>
    <div class="form-group full"><div class="form-label">Project (optional)</div><select class="form-input" id="fi-project">${projectOpts}</select></div>
    <div class="form-group full"><div class="form-label">Notes (optional)</div><textarea class="form-input" id="fi-notes" rows="2" placeholder="Notes to client, payment terms, etc.">${escapeHtml(i.notes || '')}</textarea></div>
  </div>

  <div style="margin-top:18px">
    <div style="font-size:12px;font-weight:600;color:var(--ink);margin-bottom:8px">Line Items (optional)</div>
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
      <tbody id="fi-line-rows">
        ${items.map(item => lineItemRowHTML(item)).join('')}
      </tbody>
    </table>
    <button type="button" class="btn btn-ghost" style="margin-top:8px;font-size:11px;padding:4px 10px" onclick="addInvoiceRow()">+ Add Row</button>
    <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px">
      <div style="display:flex;justify-content:flex-end;gap:16px;font-size:12px"><span style="color:var(--ink-3)">Subtotal</span><span id="fi-subtotal" style="font-weight:600;min-width:100px;text-align:right">${hasItems ? formatCurrency(subtotal) : '—'}</span></div>
      <div style="display:flex;justify-content:flex-end;gap:16px;font-size:12px;margin-top:4px"><span style="color:var(--ink-3)">VAT</span><span id="fi-vat-display" style="min-width:100px;text-align:right">${hasItems ? formatCurrency(vatAmt) : '—'}</span></div>
      <div style="display:flex;justify-content:flex-end;gap:16px;font-size:13px;margin-top:6px;font-weight:700"><span>Total</span><span id="fi-total-display" style="min-width:100px;text-align:right">${hasItems ? formatCurrency(total) : '—'}</span></div>
    </div>
  </div>

  <div id="fi-payment-section" style="margin-top:18px;border-top:1px solid var(--border);padding-top:14px;display:${i.status === 'Paid' ? 'block' : 'none'}">
    <div style="font-size:12px;font-weight:600;color:var(--ink);margin-bottom:8px">Official Receipt / Payment Details</div>
    <div class="form-grid">
      <div class="form-group"><div class="form-label">Payment Method</div>
        <select class="form-input" id="fi-pay-method">
          <option value="">— select —</option>
          ${payMethodOpts}
        </select>
      </div>
      <div class="form-group"><div class="form-label">Reference / Check #</div><input class="form-input" id="fi-pay-ref" value="${escapeHtml(i.payment_reference || '')}" placeholder="GCash ref, BPI confirmation, etc."/></div>
      <div class="form-group"><div class="form-label">Payment Date</div><input class="form-input" id="fi-pay-date" type="date" value="${toISODate(i.payment_date)}"/></div>
      <div class="form-group"><div class="form-label">Received By</div><input class="form-input" id="fi-received-by" value="${escapeHtml(i.received_by || '')}" placeholder="Name of person who received payment"/></div>
    </div>
  </div>`;
}

// ── OR row ────────────────────────────────────────────────────────────────────

export function orRowHTML(
  i: Invoice,
  proj: Project | null | undefined,
  linkedSOB: SOB | null | undefined,
): string {
  return `
    <tr>
      <td style="font-size:11px;color:var(--ink-3)">
        ${escapeHtml(i.or_num)}
        ${linkedSOB ? `<div style="font-size:9px;color:var(--ink-3);margin-top:1px">from ${escapeHtml(linkedSOB.sob_num)}</div>` : ''}
      </td>
      <td style="font-weight:500;color:var(--ink)">${escapeHtml(i.client ?? '—')}</td>
      <td style="font-size:11px;color:var(--ink-3)">${proj ? escapeHtml(proj.name) : '—'}</td>
      <td class="amount-cell">${formatCurrency(i.amount)}</td>
      <td style="font-size:11px;color:var(--ink-3)">${i.payment_date ? displayDate(i.payment_date) : '—'}</td>
      <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(i.payment_method ?? '—')}</td>
      <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(i.payment_reference ?? '—')}</td>
      <td>
        <div class="flex-gap" style="gap:4px">
          <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--green)" onclick="printOfficialReceipt(${i.id})">Print OR</button>
          <div class="action-menu">
            <button class="action-menu-trigger" onclick="toggleActionMenu(this)">···</button>
            <div class="action-menu-dropdown">
              <button onclick="printInvoice(${i.id})">View Invoice</button>
              ${i.project_id ? `<button onclick="openProjectDetail(${i.project_id})">View Project</button>` : ''}
              <button style="color:var(--blue)" onclick="sendInvoiceEmail(${i.id})">Email</button>
            </div>
          </div>
        </div>
      </td>
    </tr>`;
}
