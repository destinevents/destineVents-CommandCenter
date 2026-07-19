import { formatCurrency } from '@shared/utils/formatUtils.ts';
import { formatDateShort, todayISO } from '@shared/utils/dateUtils.ts';
import { escapeHtml, statusClass } from '@shared/utils/helpers.ts';
import { validateRequired } from '@shared/utils/validators.ts';
import { APP_SETTINGS } from '@config/settings.ts';
import {
  paginationBar, invoiceRowHTML, lineItemRowHTML, invoiceFormHTML, orRowHTML, displayDate,
} from '../templates/invoices.ts';
import {
  createInvoice, updateInvoice, deleteInvoice,
  calcFinanceSummary, fetchLineItems, upsertLineItems,
} from '@hq/finance/financeService.ts';
import { updateSOB, createSOB } from '@hq/finance/sobService.ts';
import { createInvoicePaymentLink } from '@hq/finance/paymentService.ts';
import { updateProject } from '@hq/projects/projectService.ts';
import {
  _invoices, _bills, _payroll, _sobs, _clients, _projects,
} from '@hq/core/state.ts';
import { toast, openModal, closeModal } from '@hq/core/ui.ts';
import type { Invoice, InvoiceLineItem, SOB } from '@shared/types.ts';
import { loadFinance } from '../finance.ts';

const gEl = (id: string) => document.getElementById(id)!;
const gVal = (id: string) => (document.getElementById(id) as HTMLInputElement).value;

// ── AR module-level state ─────────────────────────────────────────────────────
let _editingInvoiceId: number | null   = null;
let _showArchivedInvoices              = false;
let _pendingSOBConvertId: number | null = null;
let _showPaidInvoices                  = false;
let _paidInvoicePage                   = 1;
let _orPage                            = 1;
const INVOICE_PAGE_SIZE                = 10;
const OR_PAGE_SIZE                     = 10;

export function togglePaidInvoices() {
  _showPaidInvoices = !_showPaidInvoices;
  _paidInvoicePage  = 1;
  renderAR(_invoices);
}

export function setInvoicePage(page: number) {
  _paidInvoicePage = page;
  renderAR(_invoices);
}

export function setORPage(page: number) {
  _orPage = page;
  renderOfficialReceipts();
}

// ── AR Billing Pipeline ────────────────────────────────────────────────────────

const AR_PIPELINE = [
  'Proposal Approved',
  'Statement of Billing',
  'Invoice',
  'Payment',
  'Official Receipt',
  'Completed',
] as const;
type ARStage = typeof AR_PIPELINE[number];

export function renderARPipeline() {
  const el = document.getElementById('ar-pipeline');
  if (!el) return;
  const active = _projects.filter(p => AR_PIPELINE.includes(p.status as ARStage) && p.status !== 'Completed');
  if (!active.length) { el.innerHTML = ''; return; }
  const sorted = [...active].sort((a, b) =>
    AR_PIPELINE.indexOf(a.status as ARStage) - AR_PIPELINE.indexOf(b.status as ARStage)
  );
  const s = 'padding:3px 8px;font-size:11px;color:var(--blue)';
  el.innerHTML = `
    <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:8px">Billing Pipeline (${active.length})</div>
    <div style="border:1px solid var(--ink-4);overflow:hidden;margin-bottom:16px">
      <table class="ledger-table">
        <thead><tr><th>Project</th><th>Client</th><th>Value</th><th>Stage</th><th></th></tr></thead>
        <tbody>
          ${sorted.map(p => {
            const idx = AR_PIPELINE.indexOf(p.status as ARStage);
            let nextBtn = '';
            if (idx === 0) nextBtn = `<button class="btn btn-ghost" style="${s}" onclick="openARProjectSOB(${p.id})">→ SOB</button>`;
            else if (idx === 1) nextBtn = `<span style="font-size:11px;color:var(--ink-3)">Use SOB → Invoice below</span>`;
            else if (idx === 2) nextBtn = `<button class="btn btn-ghost" style="${s}" onclick="advanceARProjectStage(${p.id})">→ Payment</button>`;
            else if (idx === 3) nextBtn = `<button class="btn btn-ghost" style="${s}" onclick="advanceARProjectStage(${p.id})">→ OR</button>`;
            else if (idx === 4) nextBtn = `<button class="btn btn-ghost" style="${s}" onclick="advanceARProjectStage(${p.id})">→ Complete</button>`;
            return `<tr>
              <td style="font-weight:500;color:var(--ink)">${escapeHtml(p.name)}</td>
              <td style="font-size:11px;color:var(--ink-2)">${escapeHtml(p.client || '—')}</td>
              <td class="amount-cell">${formatCurrency(p.value)}</td>
              <td><span class="badge badge-${statusClass(p.status)}">${escapeHtml(p.status)}</span></td>
              <td><div class="flex-gap" style="gap:4px">${nextBtn}</div></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

export function openARProjectSOB(id: number) {
  const p = _projects.find(x => x.id === id);
  if (!p) return;
  openModal('Create Statement of Billing', `<div class="form-grid">
    <div class="form-group"><div class="form-label">SOB Number</div><input class="form-input" id="arsob-num" placeholder="SOB-2026-001"/></div>
    <div class="form-group"><div class="form-label">Client</div><input class="form-input" id="arsob-client" value="${escapeHtml(p.client || '')}"/></div>
    <div class="form-group"><div class="form-label">Amount (₱)</div><input class="form-input" id="arsob-amount" type="number" value="${p.value || 0}" min="0"/></div>
    <div class="form-group"><div class="form-label">Issue Date</div><input class="form-input" id="arsob-issue" type="date" value="${todayISO()}"/></div>
    <div class="form-group"><div class="form-label">Due Date</div><input class="form-input" id="arsob-due" type="date"/></div>
    <div class="form-group full" style="font-size:11px;color:var(--ink-3)">Project: <strong>${escapeHtml(p.name)}</strong> · ${formatCurrency(p.value)}</div>
  </div>`, async () => {
    const sob_num = (document.getElementById('arsob-num') as HTMLInputElement).value.trim();
    if (!sob_num) { toast('SOB number is required', 'error'); return; }
    const amount = +(document.getElementById('arsob-amount') as HTMLInputElement).value || 0;
    const result = await createSOB({
      sob_num,
      client:       (document.getElementById('arsob-client') as HTMLInputElement).value.trim(),
      total_amount: amount,
      subtotal:     amount,
      discount:     0,
      vat_amount:   0,
      issue_date:   (document.getElementById('arsob-issue') as HTMLInputElement).value || null,
      due_date:     (document.getElementById('arsob-due') as HTMLInputElement).value || null,
      project_id:   p.id,
      status:       'Draft',
      currency:     'PHP',
    });
    if (!result) { toast('Could not create SOB. Please try again.', 'error'); return; }
    await updateProject(p.id, { status: 'Statement of Billing', updated_at: new Date().toISOString() });
    toast('SOB created — project moved to Statement of Billing', 'success');
    closeModal();
    loadFinance();
  });
}


export async function advanceARProjectStage(id: number) {
  const p = _projects.find(x => x.id === id);
  if (!p) return;
  const idx = AR_PIPELINE.indexOf(p.status as ARStage);
  if (idx === -1 || idx >= AR_PIPELINE.length - 1) return;
  const nextStage = AR_PIPELINE[idx + 1];
  const ok = await updateProject(id, { status: nextStage, updated_at: new Date().toISOString() });
  if (!ok) { toast('Could not update project status', 'error'); return; }
  toast(`Advanced to: ${nextStage}`, 'success');
  loadFinance();
}

// ── Receivables Dashboard ─────────────────────────────────────────────────────

export function renderReceivablesDashboard() {
  const el = document.getElementById('receivables-stats');
  if (!el) return;
  const summary = calcFinanceSummary(_invoices, _bills, _payroll);
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px">
      <div class="stat-card" style="padding:10px 12px">
        <div class="stat-label">Outstanding</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:700;color:var(--amber)">${formatCurrency(summary.arOutstanding)}</div>
      </div>
      <div class="stat-card" style="padding:10px 12px">
        <div class="stat-label">Overdue</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:700;color:var(--red)">${formatCurrency(summary.overdueTotal)}</div>
        <div style="font-size:10px;color:var(--ink-3);margin-top:2px">${summary.overdueCount} invoice${summary.overdueCount !== 1 ? 's' : ''}</div>
      </div>
      <div class="stat-card" style="padding:10px 12px">
        <div class="stat-label">Collected Today</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:700;color:var(--green)">${formatCurrency(summary.collectedToday)}</div>
      </div>
      <div class="stat-card" style="padding:10px 12px">
        <div class="stat-label">Collected This Month</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:700;color:var(--green)">${formatCurrency(summary.collectedThisMonth)}</div>
      </div>
      <div class="stat-card" style="padding:10px 12px">
        <div class="stat-label">Avg Collection Time</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:700">${summary.avgCollectionDays}<span style="font-size:12px;font-weight:400;color:var(--ink-3)"> days</span></div>
      </div>
    </div>`;
}

// ── AR (Invoices) ─────────────────────────────────────────────────────────────

export function renderAR(invoices: Invoice[]) {
  const archivedCount = invoices.filter(i => i.archived_at).length;
  const toggleBtn = document.getElementById('ar-archive-toggle');

  // ── Archived mode: flat list ───────────────────────────────────────────────
  if (_showArchivedInvoices) {
    const archived = invoices.filter(i => i.archived_at);
    const total    = archived.reduce((s, i) => s + i.amount, 0);
    gEl('ar-summary').textContent = `${archived.length} archived invoice${archived.length !== 1 ? 's' : ''} · ${formatCurrency(total)} total`;
    if (toggleBtn) toggleBtn.textContent = 'Hide Archived';
    gEl('ar-tbody').innerHTML = archived.length
      ? archived.map(i => invoiceRowHTML(i, _sobs, !!APP_SETTINGS.banking.bpiQrImageUrl)).join('')
      : `<tr><td colspan="7"><div class="empty-state">No archived invoices</div></td></tr>`;
    const recentPayEl = document.getElementById('ar-recent-payments');
    if (recentPayEl) recentPayEl.innerHTML = '';
    return;
  }

  // ── Normal mode: Active / Cancelled / Paid groups ─────────────────────────
  const nonArchived = invoices.filter(i => !i.archived_at);
  const active      = nonArchived.filter(i => !['Paid', 'Cancelled'].includes(i.status));
  const paid        = nonArchived
    .filter(i => i.status === 'Paid')
    .sort((a, b) => (b.payment_date || b.date || '').localeCompare(a.payment_date || a.date || ''));
  const cancelled   = nonArchived.filter(i => i.status === 'Cancelled');
  const outstanding = active.reduce((s, i) => s + i.amount, 0);
  const totalAll    = nonArchived.reduce((s, i) => s + i.amount, 0);

  gEl('ar-summary').textContent =
    `${nonArchived.length} invoice${nonArchived.length !== 1 ? 's' : ''} · ${formatCurrency(totalAll)} total · ${formatCurrency(outstanding)} outstanding`;
  if (toggleBtn) toggleBtn.textContent = `Archived (${archivedCount})`;

  // Active rows (always shown, no pagination)
  const activeRows = active.length
    ? active.map(i => invoiceRowHTML(i, _sobs, !!APP_SETTINGS.banking.bpiQrImageUrl)).join('')
    : `<tr><td colspan="7"><div class="empty-state" style="padding:10px 0">No active invoices — all clear!</div></td></tr>`;

  // Cancelled rows (usually few, no pagination)
  const cancelledRows = cancelled.length
    ? `<tr style="background:var(--linen-2)">
         <td colspan="7" style="padding:5px 14px;font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3)">
           Cancelled (${cancelled.length})
         </td>
       </tr>
       ${cancelled.map(i => invoiceRowHTML(i, _sobs, !!APP_SETTINGS.banking.bpiQrImageUrl)).join('')}`
    : '';

  // Paid group: collapsible + paginated
  const paidTotal  = paid.reduce((s, i) => s + i.amount, 0);
  const pStart     = (_paidInvoicePage - 1) * INVOICE_PAGE_SIZE;
  const paidPage   = paid.slice(pStart, pStart + INVOICE_PAGE_SIZE);
  const pagBar     = paginationBar(_paidInvoicePage, paid.length, INVOICE_PAGE_SIZE, 'setInvoicePage');

  const paidHeader = `
    <tr style="background:var(--linen-2);cursor:pointer;user-select:none" onclick="togglePaidInvoices()">
      <td colspan="7" style="padding:8px 14px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2)">${_showPaidInvoices ? '▾' : '▸'} Paid (${paid.length})</span>
          ${paid.length > 0 ? `<span style="font-size:12px;color:var(--green);font-family:'Cormorant Garamond',serif;font-weight:700">${formatCurrency(paidTotal)}</span>` : ''}
          <span style="font-size:10px;color:var(--ink-3);margin-left:auto">${_showPaidInvoices ? 'click to collapse' : 'click to expand'}</span>
        </div>
      </td>
    </tr>`;

  const paidRows = _showPaidInvoices && paid.length > 0
    ? paidPage.map(i => invoiceRowHTML(i, _sobs, !!APP_SETTINGS.banking.bpiQrImageUrl)).join('')
    : '';

  const pagRow = _showPaidInvoices && pagBar
    ? `<tr><td colspan="7" style="padding:0">${pagBar}</td></tr>`
    : '';

  gEl('ar-tbody').innerHTML = activeRows + cancelledRows + paidHeader + paidRows + pagRow;

  // ── Recent Payments ────────────────────────────────────────────────────────
  const recentPayEl = document.getElementById('ar-recent-payments');
  if (recentPayEl) {
    const recentPaid = paid.slice(0, 5);
    if (recentPaid.length) {
      recentPayEl.innerHTML = `
        <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:8px">Recent Payments</div>
        ${recentPaid.map(p => `
          <div class="activity-item">
            <div class="activity-dot green"></div>
            <div style="flex:1">
              <div class="activity-text">${escapeHtml(p.client ?? '—')} · ${escapeHtml(p.or_num)}</div>
              <div class="activity-time">${p.payment_date ? displayDate(p.payment_date) : displayDate(p.date)}${p.payment_method ? ` · ${escapeHtml(p.payment_method)}` : ''}</div>
            </div>
            <div style="font-family:'Cormorant Garamond',serif;font-size:13px;font-weight:600;color:var(--green)">${formatCurrency(p.amount)}</div>
          </div>`).join('')}`;
    } else {
      recentPayEl.innerHTML = '';
    }
  }
}

export function toggleArchivedInvoices() {
  _showArchivedInvoices = !_showArchivedInvoices;
  renderAR(_invoices);
}


export function openAddInvoice() {
  _editingInvoiceId    = null;
  _pendingSOBConvertId = null;
  const unlinkedSOBs = _sobs.filter(s => !s.linked_invoice_id && !s.archived_at && !['Paid','Cancelled'].includes(s.status));
  const sobTip = unlinkedSOBs.length > 0
    ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:4px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:#1e40af">
        💡 <strong>${unlinkedSOBs.length} unlinked SOB${unlinkedSOBs.length !== 1 ? 's' : ''}</strong> exist (${unlinkedSOBs.map(s => escapeHtml(s.sob_num)).join(', ')}). Consider converting one instead of creating manually.
      </div>`
    : `<div style="background:var(--linen-3);border:1px solid var(--ink-4);border-radius:4px;padding:8px 14px;margin-bottom:16px;font-size:12px;color:var(--ink-3)">
        Creating a standalone invoice — not linked to a Statement of Billing.
      </div>`;
  openModal('New Invoice (AR)', sobTip + invoiceFormHTML({}, [], _clients, _projects), saveInvoice);
}

export function openInvoiceFromSOB(draft: Partial<Invoice>, items: InvoiceLineItem[], sobId: number) {
  _editingInvoiceId   = null;
  _pendingSOBConvertId = sobId;
  openModal('New Invoice from SOB', invoiceFormHTML(draft, items, _clients, _projects), saveInvoice);
}

export async function openEditInvoice(id: number) {
  const i = _invoices.find(x => x.id === id);
  if (!i) return;
  _editingInvoiceId = id;
  const items = await fetchLineItems(id);
  openModal('Edit Invoice', invoiceFormHTML(i, items, _clients, _projects), saveInvoice);
}

export async function saveInvoice() {
  const or_num = gVal('fi-or').trim();
  const err = validateRequired(or_num, 'OR number');
  if (err) { toast(err, 'error'); return; }
  const amount = +gVal('fi-amount');
  if (!amount || amount <= 0) { toast('Amount must be greater than ₱0 (add line items or enter amount directly)', 'error'); return; }
  const projVal = (document.getElementById('fi-project') as HTMLInputElement | null)?.value;
  const status  = gVal('fi-status');

  const rows = document.querySelectorAll<HTMLTableRowElement>('#fi-line-rows .li-row');
  const lineItems: InvoiceLineItem[] = [];
  rows.forEach(row => {
    const description = (row.querySelector('.li-desc') as HTMLInputElement).value.trim();
    const quantity    = +(row.querySelector('.li-qty') as HTMLInputElement).value  || 1;
    const unit_price  = +(row.querySelector('.li-price') as HTMLInputElement).value || 0;
    const vat_rate    = +(row.querySelector('.li-vat') as HTMLInputElement).value  || 0;
    if (description) lineItems.push({ description, quantity, unit_price, vat_rate });
  });

  const subtotal  = lineItems.reduce((s, li) => s + li.quantity * li.unit_price, 0);
  const vatAmount = lineItems.reduce((s, li) => s + li.quantity * li.unit_price * li.vat_rate / 100, 0);

  const payload: Partial<Invoice> = {
    or_num,
    client:     gVal('fi-client'),
    amount,
    status,
    date:       gVal('fi-date') || null,
    due:        gVal('fi-due')  || null,
  };
  if (projVal) payload.project_id = +projVal;

  // Only include new columns when they have values — avoids PGRST204 if
  // the schema cache hasn't refreshed after the migration yet.
  const notes           = (document.getElementById('fi-notes') as HTMLTextAreaElement | null)?.value.trim() || '';
  const tin             = (document.getElementById('fi-tin') as HTMLInputElement | null)?.value.trim() || '';
  const businessAddress = (document.getElementById('fi-address') as HTMLInputElement | null)?.value.trim() || '';
  const payMethod       = (document.getElementById('fi-pay-method') as HTMLSelectElement | null)?.value || '';
  const payRef          = (document.getElementById('fi-pay-ref') as HTMLInputElement | null)?.value.trim() || '';
  const payDate         = (document.getElementById('fi-pay-date') as HTMLInputElement | null)?.value || '';
  const receivedBy      = (document.getElementById('fi-received-by') as HTMLInputElement | null)?.value.trim() || '';
  if (lineItems.length)  { payload.subtotal = subtotal; payload.vat_amount = vatAmount; }
  if (notes)             payload.notes             = notes;
  if (tin)               payload.tin               = tin;
  if (businessAddress)   payload.business_address  = businessAddress;
  if (payMethod)         payload.payment_method    = payMethod;
  if (payRef)            payload.payment_reference = payRef;
  if (payDate)           payload.payment_date      = payDate;
  if (receivedBy)        payload.received_by       = receivedBy;

  let invoiceId = _editingInvoiceId;
  if (invoiceId) {
    const ok = await updateInvoice(invoiceId, payload);
    if (!ok) { toast('Could not update invoice', 'error'); return; }
    toast('Invoice updated', 'success');
  } else {
    const result = await createInvoice(payload);
    if (!result) { toast('Could not add invoice. Please try again.', 'error'); return; }
    invoiceId = result.id;
    toast('Invoice added', 'success');
  }

  if (invoiceId && lineItems.length) {
    await upsertLineItems(invoiceId, lineItems);
  }

  if (_pendingSOBConvertId && invoiceId) {
    await updateSOB(_pendingSOBConvertId, { linked_invoice_id: invoiceId, status: 'Sent' } as Partial<SOB>);
    _pendingSOBConvertId = null;
  }

  closeModal();
  loadFinance();
}

export async function handleDeleteInvoice(id: number) {
  if (!confirm('Delete this invoice? This cannot be undone.')) return;
  // Clear the SOB link so it doesn't point to a deleted invoice
  const linkedSOB = _sobs.find(s => s.linked_invoice_id === id);
  if (linkedSOB) {
    await updateSOB(linkedSOB.id, { linked_invoice_id: null, status: 'Sent' } as Partial<SOB>);
  }
  const ok = await deleteInvoice(id);
  if (!ok) { toast('Could not delete invoice', 'error'); return; }
  toast('Invoice deleted', '');
  loadFinance();
}

export async function openDuplicateInvoice(id: number) {
  const original = _invoices.find(x => x.id === id);
  if (!original) return;
  const items = await fetchLineItems(id);
  _editingInvoiceId = null;
  const draft: Partial<Invoice> = {
    client:     original.client,
    amount:     original.amount,
    status:     'Draft',
    date:       null,
    due:        null,
    project_id: original.project_id,
    notes:      original.notes,
    subtotal:   original.subtotal,
    vat_amount: original.vat_amount,
    discount:   original.discount,
  };
  openModal('Duplicate Invoice', invoiceFormHTML(draft, items, _clients, _projects), saveInvoice);
  toast('Duplicated — enter a new OR number and save', '');
}

export async function printInvoice(id: number) {
  const inv = _invoices.find(x => x.id === id);
  if (!inv) return;
  const items  = await fetchLineItems(id);
  const subtotal  = inv.subtotal ?? items.reduce((s, li) => s + li.quantity * li.unit_price, 0);
  const vatAmount = inv.vat_amount ?? items.reduce((s, li) => s + li.quantity * li.unit_price * li.vat_rate / 100, 0);
  const { banking } = APP_SETTINGS;
  const proj = _projects.find(p => p.id === inv.project_id);
  const lineRowsHTML = items.length
    ? items.map(li => {
        const lineAmt = li.quantity * li.unit_price * (1 + li.vat_rate / 100);
        return `<tr>
          <td style="padding:8px 10px;border-bottom:1px solid #e8e3da">${escapeHtml(li.description)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e8e3da;text-align:right">${li.quantity}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e8e3da;text-align:right">${formatCurrency(li.unit_price)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e8e3da;text-align:right">${li.vat_rate}%</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e8e3da;text-align:right;font-weight:600">${formatCurrency(lineAmt)}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="5" style="padding:8px 10px;color:#888">—</td></tr>`;
  const w = window.open('', '_blank', 'width=860,height=700');
  if (!w) { toast('Pop-up blocked — please allow pop-ups and try again', 'error'); return; }
  w.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Invoice ${escapeHtml(inv.or_num)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;background:#fff;padding:48px}
  .brand{font-size:28px;font-weight:700;letter-spacing:-0.5px}
  .brand span{font-weight:300;color:#666}
  .tagline{font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#888;margin-top:3px}
  .inv-title{font-size:22px;font-weight:600;color:#999;text-align:right}
  .inv-or{font-size:30px;font-weight:700;text-align:right;letter-spacing:-0.5px}
  table.items{width:100%;border-collapse:collapse;margin:20px 0}
  table.items thead th{background:#f5f0e8;padding:8px 10px;text-align:left;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#666}
  table.items thead th:not(:first-child){text-align:right}
  .label{font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#888;margin-bottom:3px}
  .value{font-size:13px;color:#1a1a1a}
  .total-row{display:flex;justify-content:space-between;font-size:13px;padding:4px 0}
  .total-final{font-size:20px;font-weight:700;border-top:2px solid #1a1a1a;padding-top:10px;margin-top:8px;display:flex;justify-content:space-between}
  .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase}
  .badge-paid{background:#d4f5e2;color:#1a7a45}
  .badge-unpaid{background:#fef3c7;color:#92400e}
  .badge-overdue{background:#fee2e2;color:#991b1b}
  .footer{margin-top:48px;padding-top:18px;border-top:1px solid #e8e3da;font-size:10px;color:#aaa;text-align:center;line-height:1.8}
  @media print{body{padding:24px}.no-print{display:none}}
</style>
</head>
<body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px">
  <div>
    <div class="brand">destine<span>vents</span></div>
    <div class="tagline">DestineVents Collective OPC</div>
    <div style="font-size:11px;color:#888;margin-top:8px;line-height:1.7">
      Baguio City, Philippines<br>
      ${escapeHtml(banking.bpiAccountName)}<br>
      BPI Account: ${escapeHtml(banking.bpiAccountNumber)}
    </div>
  </div>
  <div style="text-align:right">
    <div class="inv-title">${inv.status === 'Paid' ? 'OFFICIAL RECEIPT' : 'INVOICE'}</div>
    <div class="inv-or">${escapeHtml(inv.or_num)}</div>
    <div style="margin-top:8px">
      <span class="badge badge-${inv.status === 'Paid' ? 'paid' : inv.status === 'Overdue' ? 'overdue' : 'unpaid'}">${escapeHtml(inv.status)}</span>
    </div>
  </div>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-bottom:32px;padding-bottom:24px;border-bottom:1px solid #e8e3da">
  <div>
    <div class="label">Billed To</div>
    <div class="value" style="font-weight:600;font-size:15px">${escapeHtml(inv.client ?? '—')}</div>
    ${inv.tin ? `<div style="font-size:11px;color:#888;margin-top:2px">TIN: ${escapeHtml(inv.tin)}</div>` : ''}
    ${inv.business_address ? `<div style="font-size:11px;color:#888;margin-top:2px">${escapeHtml(inv.business_address)}</div>` : ''}
    ${proj ? `<div style="font-size:11px;color:#888;margin-top:3px">Project: ${escapeHtml(proj.name)}</div>` : ''}
  </div>
  <div>
    <div class="label">Date Issued</div>
    <div class="value">${inv.date ? formatDateShort(inv.date) : '—'}</div>
    <div class="label" style="margin-top:10px">Due Date</div>
    <div class="value">${inv.due ? formatDateShort(inv.due) : '—'}</div>
  </div>
  <div>
    ${inv.status === 'Paid' ? `
    <div class="label">Payment Date</div>
    <div class="value">${inv.payment_date ? formatDateShort(inv.payment_date) : '—'}</div>
    <div class="label" style="margin-top:10px">Payment Method</div>
    <div class="value">${escapeHtml(inv.payment_method ?? '—')}</div>
    ${inv.payment_reference ? `<div style="font-size:11px;color:#888;margin-top:2px">Ref: ${escapeHtml(inv.payment_reference)}</div>` : ''}
    ` : ''}
  </div>
</div>

${items.length > 0 ? `
<table class="items">
  <thead><tr>
    <th style="width:45%">Description</th>
    <th style="width:10%">Qty</th>
    <th style="width:15%">Unit Price</th>
    <th style="width:10%">VAT</th>
    <th style="width:20%">Amount</th>
  </tr></thead>
  <tbody>${lineRowsHTML}</tbody>
</table>
<div style="display:flex;justify-content:flex-end">
  <div style="width:280px">
    <div class="total-row"><span style="color:#888">Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
    ${vatAmount > 0 ? `<div class="total-row"><span style="color:#888">VAT</span><span>${formatCurrency(vatAmount)}</span></div>` : ''}
    <div class="total-final"><span>Total Due</span><span>${formatCurrency(inv.amount)}</span></div>
  </div>
</div>` : `
<div style="display:flex;justify-content:flex-end;margin:32px 0">
  <div style="width:280px">
    <div class="total-final"><span>Total Due</span><span>${formatCurrency(inv.amount)}</span></div>
  </div>
</div>`}

${inv.notes ? `<div style="margin-top:24px;padding:14px;background:#f9f6f0;border-radius:6px;font-size:12px;color:#555;line-height:1.7"><strong>Notes:</strong> ${escapeHtml(inv.notes)}</div>` : ''}

<div style="margin-top:20px;no-print" class="no-print">
  <button onclick="window.print()" style="padding:8px 20px;background:#1a1a1a;color:#fff;border:none;border-radius:4px;font-size:13px;cursor:pointer">Print / Save as PDF</button>
</div>

<div class="footer">
  DestineVents Collective OPC · Baguio City, Philippines · destinevents.biz@gmail.com<br>
  Thank you for your trust and partnership.
</div>
</body>
</html>`);
  w.document.close();
  w.focus();
}

export async function archiveInvoice(id: number) {
  const ok = await updateInvoice(id, { archived_at: new Date().toISOString() } as Partial<Invoice>);
  if (!ok) { toast('Could not archive invoice', 'error'); return; }
  toast('Invoice archived', '');
  loadFinance();
}

export async function restoreInvoice(id: number) {
  const ok = await updateInvoice(id, { archived_at: null } as Partial<Invoice>);
  if (!ok) { toast('Could not restore invoice', 'error'); return; }
  toast('Invoice restored', '');
  loadFinance();
}

export function addInvoiceRow() {
  const tbody = document.getElementById('fi-line-rows');
  if (!tbody) return;
  tbody.insertAdjacentHTML('beforeend', lineItemRowHTML());
  recalcInvoice();
}

export function recalcInvoice() {
  const rows = document.querySelectorAll<HTMLTableRowElement>('#fi-line-rows .li-row');
  let subtotal = 0;
  let vatTotal = 0;
  rows.forEach(row => {
    const qty   = +(row.querySelector('.li-qty')   as HTMLInputElement).value || 0;
    const price = +(row.querySelector('.li-price') as HTMLInputElement).value || 0;
    const vat   = +(row.querySelector('.li-vat')   as HTMLInputElement).value || 0;
    const lineSub = qty * price;
    const lineVat = lineSub * vat / 100;
    subtotal += lineSub;
    vatTotal += lineVat;
    const amtCell = row.querySelector('.li-amt');
    if (amtCell) amtCell.textContent = formatCurrency(lineSub + lineVat);
  });
  const total = subtotal + vatTotal;
  const stEl  = document.getElementById('fi-subtotal');
  const vatEl = document.getElementById('fi-vat-display');
  const totEl = document.getElementById('fi-total-display');
  const amtEl = document.getElementById('fi-amount') as HTMLInputElement | null;
  if (stEl)  stEl.textContent  = formatCurrency(subtotal);
  if (vatEl) vatEl.textContent = formatCurrency(vatTotal);
  if (totEl) totEl.textContent = formatCurrency(total);
  if (amtEl) {
    amtEl.value    = String(total);
    amtEl.readOnly = rows.length > 0;
  }
}

export function togglePaymentFields(status: string) {
  const section = document.getElementById('fi-payment-section');
  if (section) section.style.display = status === 'Paid' ? 'block' : 'none';
  const cancelEl = document.getElementById('fi-status') as HTMLSelectElement | null;
  if (cancelEl) {
    const row = cancelEl.closest('.form-group');
    if (row) (row as HTMLElement).style.opacity = status === 'Cancelled' ? '0.6' : '1';
  }
}

export function openRecordPayment(id: number) {
  const inv = _invoices.find(x => x.id === id);
  if (!inv) return;
  if (inv.status === 'Paid') { toast('This invoice is already marked as paid', 'error'); return; }
  _editingInvoiceId = id;
  const payMethodOpts = ['GCash', 'BPI', 'PayMongo', 'Cash', 'Check', 'Bank Transfer', 'Other']
    .map(m => `<option value="${m}">${m}</option>`).join('');
  openModal(`Record Payment — ${escapeHtml(inv.or_num)}`, `
    <div style="margin-bottom:14px;font-size:13px;color:var(--ink-2)">
      Recording payment from <strong>${escapeHtml(inv.client ?? '')}</strong><br>
      <span style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:700;color:var(--ink)">${formatCurrency(inv.amount)}</span>
    </div>
    <div class="form-grid">
      <div class="form-group"><div class="form-label">Payment Method</div>
        <select class="form-input" id="rp-method">
          <option value="">— select —</option>
          ${payMethodOpts}
        </select>
      </div>
      <div class="form-group"><div class="form-label">Reference / Check #</div><input class="form-input" id="rp-ref" placeholder="GCash ref, BPI confirmation, etc."/></div>
      <div class="form-group"><div class="form-label">Payment Date</div><input class="form-input" id="rp-date" type="date" value="${todayISO()}"/></div>
      <div class="form-group"><div class="form-label">Received By</div><input class="form-input" id="rp-received" placeholder="Your name or team member"/></div>
    </div>`, saveRecordPayment);
}

export async function saveRecordPayment() {
  if (!_editingInvoiceId) return;
  const method = (document.getElementById('rp-method') as HTMLSelectElement).value;
  if (!method) { toast('Please select a payment method', 'error'); return; }
  const payload: Partial<Invoice> = {
    status:            'Paid',
    payment_method:    method,
    payment_reference: (document.getElementById('rp-ref') as HTMLInputElement).value.trim() || null,
    payment_date:      (document.getElementById('rp-date') as HTMLInputElement).value || null,
    received_by:       (document.getElementById('rp-received') as HTMLInputElement).value.trim() || null,
  };
  const ok = await updateInvoice(_editingInvoiceId, payload);
  if (!ok) { toast('Could not record payment', 'error'); return; }
  toast('Payment recorded — invoice marked as Paid', 'success');
  const paidId = _editingInvoiceId;
  closeModal();
  loadFinance();
  setTimeout(() => printOfficialReceipt(paidId), 400);
}

export function openBpiQr(id: number, amount: number, client: string, orNum: string) {
  const { banking } = APP_SETTINGS;
  const bpiBranch = (banking as typeof banking & { bpiBranch?: string }).bpiBranch ?? '';
  const copyText = `BPI Transfer Details:\nAccount Name: ${banking.bpiAccountName}\nBranch: ${bpiBranch}\nAccount Number: ${banking.bpiAccountNumber}\nAmount: ₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}\nFor: ${orNum} — ${client}`;
  openModal('BPI Business QR — Pay via Bank Transfer', `
    <div style="text-align:center;margin-bottom:16px">
      <img src="${escapeHtml(banking.bpiQrImageUrl)}" alt="BPI QR Code" style="max-width:220px;border-radius:8px;border:1px solid var(--border)"/>
    </div>
    <div style="font-size:13px;line-height:2.2;border:1px solid var(--border);border-radius:8px;padding:12px 16px;margin-bottom:14px">
      <div><span style="color:var(--ink-3)">Invoice #:</span> <strong>${escapeHtml(orNum)}</strong></div>
      <div><span style="color:var(--ink-3)">Account Name:</span> <strong>${escapeHtml(banking.bpiAccountName)}</strong></div>
      <div><span style="color:var(--ink-3)">Branch:</span> <strong>${escapeHtml(bpiBranch)}</strong></div>
      <div><span style="color:var(--ink-3)">Account Number:</span> <strong>${escapeHtml(banking.bpiAccountNumber)}</strong></div>
      <div><span style="color:var(--ink-3)">Amount:</span> <strong style="font-family:'Cormorant Garamond',serif;font-size:20px">${formatCurrency(amount)}</strong></div>
      <div><span style="color:var(--ink-3)">Client:</span> <strong>${escapeHtml(client)}</strong></div>
    </div>
    <textarea class="form-input" id="bpi-copy-text" rows="5" readonly style="font-size:11px;font-family:monospace">${escapeHtml(copyText)}</textarea>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn btn-primary" style="flex:1" onclick="copyBpiText()">Copy Bank Details</button>
      <button class="btn btn-ghost" style="flex:1;border:1px solid var(--border)" onclick="downloadBpiQr()">Download QR</button>
    </div>
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
      <div style="font-size:11px;color:var(--ink-3);margin-bottom:8px">Once the client has transferred payment, record it here:</div>
      <button class="btn btn-ghost" style="width:100%;border:1px solid var(--green);color:var(--green);font-weight:600" onclick="openRecordPaymentBpi(${id})">✓ Record BPI Payment Received</button>
    </div>`, () => closeModal());
}

export function openRecordPaymentBpi(id: number) {
  openRecordPayment(id);
  setTimeout(() => {
    const sel = document.getElementById('rp-method') as HTMLSelectElement | null;
    if (sel) sel.value = 'BPI';
  }, 50);
}

export function copyBpiText() {
  const el = document.getElementById('bpi-copy-text') as HTMLTextAreaElement | null;
  if (!el) return;
  navigator.clipboard.writeText(el.value)
    .then(() => toast('Bank details copied', 'success'))
    .catch(() => toast('Could not copy — please copy manually', 'error'));
}

export function downloadBpiQr() {
  const { banking } = APP_SETTINGS;
  const a = document.createElement('a');
  a.href = banking.bpiQrImageUrl;
  a.download = 'DestineVents-BPI-QR.png';
  a.click();
}

export async function openPaymentLink(id: number, amount: number, client: string, orNum: string) {
  const btn = document.querySelector(`[onclick*="openPaymentLink(${id},"]`) as HTMLButtonElement | null;
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }

  const result = await createInvoicePaymentLink({
    invoiceId:   id,
    amount,
    description: `Invoice ${orNum} — ${client || 'DestineVents client'}`,
  });

  if (btn) { btn.disabled = false; btn.textContent = 'Pay Link'; }

  if (!result) {
    toast('Could not generate payment link. Check PayMongo config.', 'error');
    return;
  }

  openModal('Payment Link Generated', `
    <div style="margin-bottom:12px;font-size:13px;color:var(--ink-2)">
      Share this link with <strong>${escapeHtml(client)}</strong> to collect payment for <strong>${escapeHtml(orNum)}</strong>.
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <input class="form-input" id="pm-link-url" value="${escapeHtml(result.paymentUrl)}" readonly style="flex:1;font-size:12px"/>
      <button class="btn btn-primary" style="white-space:nowrap" onclick="copyPaymentLink()">Copy</button>
    </div>
    <div style="margin-top:10px;font-size:11px;color:var(--ink-3)">
      The invoice will automatically update to <strong>Paid</strong> once the client completes payment.
    </div>`, () => closeModal());

  toast('Payment link generated', 'success');
  loadFinance();
}

export function copyPaymentLink() {
  const input = document.getElementById('pm-link-url') as HTMLInputElement | null;
  if (!input) return;
  navigator.clipboard.writeText(input.value)
    .then(() => toast('Link copied to clipboard', 'success'))
    .catch(() => toast('Could not copy — please copy manually', 'error'));
}

export function openPaymentHistory(id: number) {
  const inv = _invoices.find(x => x.id === id);
  if (!inv || inv.status !== 'Paid') return;
  const linkedSOB = _sobs.find(s => s.linked_invoice_id === id);
  const proj      = _projects.find(p => p.id === inv.project_id);
  openModal(`Payment History — ${escapeHtml(inv.or_num)}`, `
    <div style="font-size:11px;color:var(--ink-3);margin-bottom:14px">
      ${escapeHtml(inv.client ?? '—')}${proj ? ` · ${escapeHtml(proj.name)}` : ''}
    </div>
    <div style="border:1px solid var(--border);border-radius:6px;overflow:hidden">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <tbody>
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:8px 12px;color:var(--ink-3);width:40%">Payment Date</td>
            <td style="padding:8px 12px;font-weight:500">${inv.payment_date ? displayDate(inv.payment_date) : '—'}</td>
          </tr>
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:8px 12px;color:var(--ink-3)">Amount Paid</td>
            <td style="padding:8px 12px;font-weight:600;font-family:'Cormorant Garamond',serif;font-size:16px;color:var(--green)">${formatCurrency(inv.amount)}</td>
          </tr>
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:8px 12px;color:var(--ink-3)">Payment Method</td>
            <td style="padding:8px 12px;font-weight:500">${escapeHtml(inv.payment_method ?? '—')}</td>
          </tr>
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:8px 12px;color:var(--ink-3)">Reference Number</td>
            <td style="padding:8px 12px;font-weight:500">${escapeHtml(inv.payment_reference ?? '—')}</td>
          </tr>
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:8px 12px;color:var(--ink-3)">Received By</td>
            <td style="padding:8px 12px;font-weight:500">${escapeHtml(inv.received_by ?? '—')}</td>
          </tr>
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:8px 12px;color:var(--ink-3)">Linked SOB</td>
            <td style="padding:8px 12px;font-weight:500">${linkedSOB ? escapeHtml(linkedSOB.sob_num) : '—'}</td>
          </tr>
          ${inv.notes ? `<tr><td style="padding:8px 12px;color:var(--ink-3)">Notes</td><td style="padding:8px 12px">${escapeHtml(inv.notes)}</td></tr>` : ''}
        </tbody>
      </table>
    </div>`, closeModal, 'Close');
}

// ── Official Receipts ─────────────────────────────────────────────────────────

export function renderOfficialReceipts() {
  const sorted = [..._invoices]
    .filter(i => i.status === 'Paid' && !i.archived_at)
    .sort((a, b) => (b.payment_date || b.date || '').localeCompare(a.payment_date || a.date || ''));
  const summaryEl = document.getElementById('or-summary');
  const tbodyEl   = document.getElementById('or-tbody');
  const pagEl     = document.getElementById('or-pagination');

  if (summaryEl) {
    const total = sorted.reduce((s, i) => s + (i.amount || 0), 0);
    summaryEl.textContent = `${sorted.length} official receipt${sorted.length !== 1 ? 's' : ''} · ${formatCurrency(total)} collected`;
  }
  if (!tbodyEl) return;

  if (!sorted.length) {
    tbodyEl.innerHTML = `<tr><td colspan="8"><div class="empty-state">No official receipts yet — paid invoices will appear here</div></td></tr>`;
    if (pagEl) pagEl.innerHTML = '';
    return;
  }

  const pStart    = (_orPage - 1) * OR_PAGE_SIZE;
  const pageRows  = sorted.slice(pStart, pStart + OR_PAGE_SIZE);

  tbodyEl.innerHTML = pageRows.map(i =>
    orRowHTML(i, i.project_id ? _projects.find(p => p.id === i.project_id) : null, _sobs.find(s => s.linked_invoice_id === i.id))
  ).join('');

  if (pagEl) pagEl.innerHTML = paginationBar(_orPage, sorted.length, OR_PAGE_SIZE, 'setORPage');
}

export async function printOfficialReceipt(id: number) {
  const inv = _invoices.find(x => x.id === id);
  if (!inv) return;
  if (inv.status !== 'Paid') { toast('OR can only be printed for paid invoices', 'error'); return; }
  const linkedSOB  = _sobs.find(s => s.linked_invoice_id === id);
  const proj       = _projects.find(p => p.id === inv.project_id);
  const { banking } = APP_SETTINGS;
  const w = window.open('', '_blank', 'width=860,height=700');
  if (!w) { toast('Pop-up blocked — please allow pop-ups and try again', 'error'); return; }
  w.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Official Receipt ${escapeHtml(inv.or_num)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;background:#fff;padding:48px}
  .brand{font-size:28px;font-weight:700;letter-spacing:-0.5px}
  .brand span{font-weight:300;color:#666}
  .tagline{font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#888;margin-top:3px}
  .doc-title{font-size:22px;font-weight:600;color:#999;text-align:right}
  .doc-num{font-size:30px;font-weight:700;text-align:right;letter-spacing:-0.5px}
  .label{font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#888;margin-bottom:3px}
  .value{font-size:13px;color:#1a1a1a}
  .pay-box{background:#f5f9f2;border:1px solid #c8e6c9;border-radius:8px;padding:20px 24px;margin:32px 0}
  .pay-amount{font-size:36px;font-weight:700;color:#1a7a45;margin:8px 0 4px}
  .footer{margin-top:48px;padding-top:18px;border-top:1px solid #e8e3da;font-size:10px;color:#aaa;text-align:center;line-height:1.8}
  @media print{body{padding:24px}.no-print{display:none}}
</style>
</head>
<body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px">
  <div>
    <div class="brand">destine<span>vents</span></div>
    <div class="tagline">DestineVents Collective OPC</div>
    <div style="font-size:11px;color:#888;margin-top:8px;line-height:1.7">
      Baguio City, Philippines<br>
      ${escapeHtml(banking.bpiAccountName)}<br>
      BPI Account: ${escapeHtml(banking.bpiAccountNumber)}
    </div>
  </div>
  <div style="text-align:right">
    <div class="doc-title">OFFICIAL RECEIPT</div>
    <div class="doc-num">${escapeHtml(inv.or_num)}</div>
    <div style="margin-top:8px;font-size:11px;color:#888">
      Linked Invoice: ${escapeHtml(inv.or_num)}${linkedSOB ? ` · SOB: ${escapeHtml(linkedSOB.sob_num)}` : ''}
    </div>
  </div>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;padding-bottom:24px;border-bottom:1px solid #e8e3da">
  <div>
    <div class="label">Received From</div>
    <div class="value" style="font-weight:600;font-size:15px">${escapeHtml(inv.client ?? '—')}</div>
    ${inv.tin ? `<div style="font-size:11px;color:#888;margin-top:2px">TIN: ${escapeHtml(inv.tin)}</div>` : ''}
    ${inv.business_address ? `<div style="font-size:11px;color:#888;margin-top:2px">${escapeHtml(inv.business_address)}</div>` : ''}
    ${proj ? `<div style="font-size:11px;color:#888;margin-top:3px">Project: ${escapeHtml(proj.name)}</div>` : ''}
  </div>
  <div>
    <div class="label">Payment Date</div>
    <div class="value" style="font-weight:600">${inv.payment_date ? formatDateShort(inv.payment_date) : '—'}</div>
    ${inv.received_by ? `<div class="label" style="margin-top:10px">Received By</div><div class="value">${escapeHtml(inv.received_by)}</div>` : ''}
  </div>
</div>

<div class="pay-box">
  <div class="label">Amount Paid</div>
  <div class="pay-amount">₱${(inv.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
    <div>
      <div class="label">Payment Method</div>
      <div class="value" style="font-weight:600">${escapeHtml(inv.payment_method ?? '—')}</div>
    </div>
    ${inv.payment_reference ? `<div><div class="label">Reference Number</div><div class="value" style="font-weight:600">${escapeHtml(inv.payment_reference)}</div></div>` : ''}
  </div>
</div>

${inv.notes ? `<div style="margin-top:16px;padding:14px;background:#f9f6f0;border-radius:6px;font-size:12px;color:#555;line-height:1.7"><strong>Notes:</strong> ${escapeHtml(inv.notes)}</div>` : ''}

<div style="margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:32px">
  <div style="border-top:1px solid #1a1a1a;padding-top:8px;text-align:center">
    <div style="font-size:11px;color:#888">Issued By</div>
    <div style="font-size:12px;margin-top:24px">${inv.received_by ? escapeHtml(inv.received_by) : '___________________________'}</div>
  </div>
  <div style="border-top:1px solid #1a1a1a;padding-top:8px;text-align:center">
    <div style="font-size:11px;color:#888">Client Acknowledgement</div>
    <div style="font-size:12px;margin-top:24px">___________________________</div>
  </div>
</div>

<div style="margin-top:20px" class="no-print">
  <button onclick="window.print()" style="padding:8px 20px;background:#1a1a1a;color:#fff;border:none;border-radius:4px;font-size:13px;cursor:pointer">Print / Save as PDF</button>
</div>

<div class="footer">
  DestineVents Collective OPC · Baguio City, Philippines · destinevents.biz@gmail.com<br>
  This is an official receipt of payment. Thank you for your partnership.
</div>
</body>
</html>`);
  w.document.close();
  w.focus();
}

export function sendInvoiceEmail(id: number) {
  const inv = _invoices.find(x => x.id === id);
  if (!inv) return;
  const isOR       = inv.status === 'Paid';
  const docLabel   = isOR ? 'Official Receipt' : 'Invoice';
  const defaultSubject = `${docLabel} ${escapeHtml(inv.or_num)} — ${escapeHtml(inv.client ?? 'Client')}`;
  const defaultBody = [
    `Dear ${inv.client ?? 'Client'},`,
    '',
    isOR
      ? `Please find attached the Official Receipt ${inv.or_num} confirming payment of ${formatCurrency(inv.amount)} received on ${inv.payment_date ? formatDateShort(inv.payment_date) : 'file'}.`
      : `Please find attached Invoice ${inv.or_num} amounting to ${formatCurrency(inv.amount)}.`,
    !isOR && inv.due ? `Payment is due on ${formatDateShort(inv.due)}.` : '',
    '',
    'Please do not hesitate to reach out should you have any questions.',
    '',
    'Thank you for your continued partnership.',
  ].filter(Boolean).join('\n');

  openModal(`Send ${docLabel} via Email`, `
    <div style="font-size:11px;color:var(--ink-3);margin-bottom:12px">
      ${docLabel} <strong>${escapeHtml(inv.or_num)}</strong> · ${formatCurrency(inv.amount)}${!isOR && inv.due ? ' · Due ' + formatDateShort(inv.due) : ''}
    </div>
    <div class="form-grid">
      <div class="form-group full"><div class="form-label">To (Recipient Email)</div><input class="form-input" id="iem-to" type="email" placeholder="client@example.com"/></div>
      <div class="form-group full"><div class="form-label">CC (optional)</div><input class="form-input" id="iem-cc" type="email" placeholder="colleague@example.com"/></div>
      <div class="form-group full"><div class="form-label">Subject</div><input class="form-input" id="iem-subject" value="${escapeHtml(defaultSubject)}"/></div>
      <div class="form-group full"><div class="form-label">Message</div><textarea class="form-input" id="iem-body" rows="8" style="font-size:11.5px;line-height:1.6">${escapeHtml(defaultBody)}</textarea></div>
    </div>
    <div style="font-size:10.5px;color:var(--ink-3);margin-top:8px">
      This will open your email client. Attach the PDF (click <strong>${isOR ? 'Print OR' : 'Print'}</strong> first to save it).
    </div>`, async () => {
    const to      = (document.getElementById('iem-to')      as HTMLInputElement).value.trim();
    const cc      = (document.getElementById('iem-cc')      as HTMLInputElement).value.trim();
    const subject = (document.getElementById('iem-subject') as HTMLInputElement).value.trim();
    const body    = (document.getElementById('iem-body')    as HTMLTextAreaElement).value.trim();
    if (!to) { toast('Recipient email is required', 'error'); return; }
    const ccPart = cc ? `&cc=${encodeURIComponent(cc)}` : '';
    window.open(`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}${ccPart}&body=${encodeURIComponent(body)}`);
    if (!isOR && inv.status === 'Draft') {
      await updateInvoice(id, { status: 'Issued' } as Partial<Invoice>);
    }
    toast('Email client opened', 'success');
    closeModal();
    loadFinance();
  }, 'Open Email Client');
}

