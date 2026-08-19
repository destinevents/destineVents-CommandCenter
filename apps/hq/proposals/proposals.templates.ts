import type { Client, Project, Proposal, ProposalLineItem, ProposalStats } from '@shared/types.ts';
import { escapeHtml, statusClass } from '@shared/utils/helpers.ts';
import { formatCurrency } from '@shared/utils/formatUtils.ts';
import { formatDateShort } from '@shared/utils/dateUtils.ts';
import { statusOptions, canTransition } from '@shared/documents/docTransitions.ts';
import { actionMenuHTML } from '@shared/components/actionMenu.ts';
import { proposalValue } from './proposalService.ts';

function toISODate(val: string | null | undefined): string {
  if (!val || val === '—') return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function displayDate(val: string | null | undefined): string {
  if (!val || val === '—') return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return formatDateShort(val);
  return escapeHtml(String(val));
}

// The one action a quotation is actually waiting for, kept out of the ⋯ menu.
// A Draft wants sending; a Won one wants converting — unless it already has
// been, in which case the button would only ever produce the "already the
// project …" refusal, so it points at that project instead.
function proposalPrimaryAction(p: Proposal, projects: Project[]): string {
  if (canTransition('quotation', p.status, 'Sent'))
    return `<button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--blue)" onclick="markQuotationSent(${p.id})">Mark Sent</button>`;

  if (p.status !== 'Won') return '';

  const linked = projects.find(x => x.proposal_id === p.id);
  if (!linked)
    return `<button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--green)" onclick="convertProposalToProject(${p.id})">→ Project</button>`;

  return `<button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--ink-3)" title="Open ${escapeHtml(linked.name)}" onclick="openProjectDetail(${linked.id})">${escapeHtml(linked.code || 'View Project')}</button>`;
}

export function proposalRowHTML(p: Proposal, projects: Project[] = []): string {
  const displayValue = proposalValue(p);
  const quoRef = escapeHtml(p.quo_number ?? String(p.id));
  return `
    <tr>
      <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(p.quo_number ?? '—')}</td>
      <td><div class="project-name">${escapeHtml(p.name)}</div><div class="project-client">${escapeHtml(p.client ?? '')}</div></td>
      <td class="project-value">${formatCurrency(displayValue)}</td>
      <td style="font-size:11px;color:var(--ink-3)">${displayDate(p.sent)}</td>
      <td style="font-size:11px;color:var(--ink-3)">${displayDate(p.followup)}</td>
      <td><span class="badge badge-${statusClass(p.status)}">${escapeHtml(p.status)}</span></td>
      <td style="text-align:right;width:1%;white-space:nowrap">
        <div class="flex-gap" style="gap:4px;justify-content:flex-end">
          ${proposalPrimaryAction(p, projects)}
          ${actionMenuHTML(`
            <button role="menuitem" onclick="printQuotation(${p.id})">PDF</button>
            <button role="menuitem" onclick="sendQuotationEmail(${p.id})">Email</button>
            <button role="menuitem" onclick="openEditProposal(${p.id})">Edit</button>
            <button role="menuitem" onclick="openDocActivityLog('quotation',${p.id},'${quoRef}')">Activity Log</button>
            <div class="action-menu-sep"></div>
            <button role="menuitem" class="menu-danger" onclick="handleDeleteProposal(${p.id})">Delete</button>`,
            `Actions for ${p.quo_number ?? p.name}`)}
        </div>
      </td>
    </tr>`;
}

export function proposalTableHTML(proposals: Proposal[], projects: Project[] = []): string {
  return proposals.length
    ? proposals.map(p => proposalRowHTML(p, projects)).join('')
    : `<tr><td colspan="7"><div class="empty-state">No proposals yet</div></td></tr>`;
}

export function proposalWinRateHTML(stats: ProposalStats): string {
  return `<div>${stats.won} won · ${stats.lost} lost · ${stats.open} open</div>
          <div>Closed: <strong>${stats.closed} of ${stats.total}</strong></div>`;
}

export function proposalValueSummaryHTML(stats: ProposalStats): string {
  return `<div>Total: <strong>${formatCurrency(stats.wonValue + stats.pipelineValue)}</strong></div>
          <div>Won: <strong style="color:var(--green)">${formatCurrency(stats.wonValue)}</strong></div>
          <div>In pipeline: <strong style="color:var(--blue)">${formatCurrency(stats.pipelineValue)}</strong></div>`;
}

export function quoLineRowHTML(item: Partial<ProposalLineItem> = {}): string {
  return `<tr class="quo-li-row">
    <td style="padding:3px 4px"><input class="form-input quo-li-desc" style="font-size:12px;padding:4px 6px" value="${escapeHtml(item.description || '')}" placeholder="Service / item" oninput="recalcQuo()"/></td>
    <td style="padding:3px 4px"><input class="form-input quo-li-qty" style="font-size:12px;padding:4px 6px;text-align:right" type="number" value="${item.quantity ?? 1}" min="0" step="any" oninput="recalcQuo()"/></td>
    <td style="padding:3px 4px"><input class="form-input quo-li-price" style="font-size:12px;padding:4px 6px;text-align:right" type="number" value="${item.unit_price ?? 0}" min="0" step="any" oninput="recalcQuo()"/></td>
    <td style="padding:3px 4px"><input class="form-input quo-li-vat" style="font-size:12px;padding:4px 6px;text-align:right" type="number" value="${item.vat_rate ?? 0}" min="0" max="100" step="any" oninput="recalcQuo()"/></td>
    <td style="padding:3px 4px;text-align:right;font-size:12px;color:var(--ink-2)" class="quo-li-total">₱0.00</td>
    <td style="padding:3px 4px"><button type="button" class="btn btn-ghost" style="padding:2px 6px;font-size:11px;color:var(--red)" onclick="this.closest('tr').remove();recalcQuo()">×</button></td>
  </tr>`;
}

export function proposalFormHTML(
  clients: Client[],
  p: Partial<Proposal> = {},
  items: ProposalLineItem[] = [],
): string {
  // Only what this quotation can actually become. Won, for instance, is
  // unreachable until the quotation has been sent — the database refuses it.
  const statusOpts = statusOptions('quotation', p.status ?? 'Draft').map(
    (s: string) => `<option${s === (p.status ?? 'Draft') ? ' selected' : ''}>${s}</option>`,
  ).join('');
  const clientOpts = clients.map(c => `<option value="${escapeHtml(c.name)}"/>`).join('');
  const lineRows   = (items.length ? items : [{}]).map(quoLineRowHTML).join('');

  return `<datalist id="hq-client-list">${clientOpts}</datalist>
  <div class="form-grid">
    <div class="form-group"><div class="form-label">QUO #</div><input class="form-input" id="fp-quo-num" value="${escapeHtml(p.quo_number ?? '')}" placeholder="Auto-generated" readonly/></div>
    <div class="form-group"><div class="form-label">Status</div><select class="form-input" id="fp-status">${statusOpts}</select></div>
    <div class="form-group full"><div class="form-label">Proposal / Project Name *</div><input class="form-input" id="fp-name" value="${escapeHtml(p.name ?? '')}" placeholder="e.g. DTI CAR MSME Summit"/></div>
    <div class="form-group"><div class="form-label">Client</div><input class="form-input" id="fp-client" value="${escapeHtml(p.client ?? '')}" list="hq-client-list" placeholder="Client name" autocomplete="off"/></div>
    <div class="form-group"><div class="form-label">Client TIN</div><input class="form-input" id="fp-client-tin" value="${escapeHtml(p.client_tin ?? '')}" placeholder="Client TIN (for PDF)"/></div>
    <div class="form-group full"><div class="form-label">Client Business Address</div><input class="form-input" id="fp-biz-address" value="${escapeHtml(p.business_address ?? '')}" placeholder="Client address (for PDF)"/></div>
    <div class="form-group"><div class="form-label">Date Sent</div><input class="form-input" id="fp-sent" type="date" value="${toISODate(p.sent)}"/></div>
    <div class="form-group"><div class="form-label">Valid Until</div><input class="form-input" id="fp-valid-until" type="date" value="${toISODate(p.valid_until)}"/></div>
    <div class="form-group"><div class="form-label">Follow-up Date</div><input class="form-input" id="fp-followup" type="date" value="${toISODate(p.followup)}"/></div>
    <div class="form-group"><div class="form-label">Prepared By</div><input class="form-input" id="fp-prepared-by" value="${escapeHtml(p.prepared_by ?? '')}" placeholder="Name of preparer"/></div>
  </div>

  <div style="margin-top:16px">
    <div class="form-label" style="margin-bottom:6px">Line Items</div>
    <div style="border:1px solid var(--ink-4);overflow:hidden">
      <table class="ledger-table" style="font-size:12px">
        <thead><tr><th>Description</th><th style="width:80px;text-align:right">Qty</th><th style="width:110px;text-align:right">Unit Price</th><th style="width:80px;text-align:right">VAT %</th><th style="width:110px;text-align:right">Subtotal</th><th style="width:40px"></th></tr></thead>
        <tbody id="quo-line-rows">${lineRows}</tbody>
      </table>
    </div>
    <button type="button" class="btn btn-ghost" style="margin-top:8px;font-size:11px;padding:4px 10px" onclick="addQuoRow()">+ Add Row</button>
  </div>

  <div style="margin-top:16px;display:grid;grid-template-columns:1fr auto;gap:16px;align-items:end">
    <div class="form-group full">
      <div class="form-label">Notes / Terms</div>
      <textarea class="form-input" id="fp-notes" rows="3" placeholder="Scope, terms, or additional details">${escapeHtml(p.notes ?? '')}</textarea>
    </div>
    <div style="min-width:220px;background:var(--ink-5);border:1px solid var(--ink-4);padding:12px 16px;font-size:13px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:var(--ink-3)">Subtotal</span><span id="fq-subtotal">₱0.00</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:var(--ink-3)">VAT</span><span id="fq-vat">₱0.00</span></div>
      <div style="display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid var(--ink-4);font-weight:700"><span>Total</span><span id="fq-total">₱0.00</span></div>
    </div>
  </div>
  <script>setTimeout(recalcQuo, 0);</script>`;
}
