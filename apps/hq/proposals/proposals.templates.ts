import type { Client, Proposal } from '@shared/types.ts';
import { escapeHtml, statusClass } from '@shared/utils/helpers.ts';
import { formatCurrency } from '@shared/utils/formatUtils.ts';
import { formatDateShort } from '@shared/utils/dateUtils.ts';
import { APP_SETTINGS } from '@config/settings.ts';

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

export function proposalRowHTML(p: Proposal): string {
  return `
    <tr>
      <td><div class="project-name">${escapeHtml(p.name)}</div><div class="project-client">${escapeHtml(p.client)}</div></td>
      <td class="project-value">${formatCurrency(p.value)}</td>
      <td style="font-size:11px;color:var(--ink-3)">${displayDate(p.sent)}</td>
      <td style="font-size:11px;color:var(--ink-3)">${displayDate(p.followup)}</td>
      <td><span class="badge badge-${statusClass(p.status)}">${escapeHtml(p.status)}</span></td>
      <td>
        <div class="flex-gap" style="gap:4px;flex-wrap:wrap">
          ${p.status === 'Won' ? `<button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--green)" onclick="convertProposalToProject(${p.id})">→ Project</button>` : ''}
          <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="openEditProposal(${p.id})">Edit</button>
          <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--red)" onclick="handleDeleteProposal(${p.id})">Delete</button>
        </div>
      </td>
    </tr>`;
}

export function proposalTableHTML(proposals: Proposal[]): string {
  return proposals.length
    ? proposals.map(proposalRowHTML).join('')
    : `<tr><td colspan="6"><div class="empty-state">No proposals yet</div></td></tr>`;
}

export interface ProposalStats {
  winRate: number;
  won: number;
  lost: number;
  total: number;
  closed: number;
  wonValue: number;
  pipelineValue: number;
}

export function proposalWinRateHTML(stats: ProposalStats): string {
  return `<div>${stats.won} won · ${stats.lost} lost · ${stats.total - stats.closed} open</div>
          <div>Closed: <strong>${stats.closed} of ${stats.total}</strong></div>`;
}

export function proposalValueSummaryHTML(stats: ProposalStats): string {
  return `<div>Total: <strong>${formatCurrency(stats.wonValue + stats.pipelineValue)}</strong></div>
          <div>Won: <strong style="color:var(--green)">${formatCurrency(stats.wonValue)}</strong></div>
          <div>In pipeline: <strong style="color:var(--blue)">${formatCurrency(stats.pipelineValue)}</strong></div>`;
}

export function proposalFormHTML(clients: Client[], p: Partial<Proposal> = {}): string {
  const statusOpts = APP_SETTINGS.finance.proposalStatuses.map((s: string) => `<option${s === p.status ? ' selected' : ''}>${s}</option>`).join('');
  const clientOpts = clients.map(c => `<option value="${escapeHtml(c.name)}"/>`).join('');
  return `<datalist id="hq-client-list">${clientOpts}</datalist>
  <div class="form-grid">
    <div class="form-group full"><div class="form-label">Proposal Name</div><input class="form-input" id="fp-name" value="${escapeHtml(p.name || '')}" placeholder="e.g. DTI CAR MSME Summit"/></div>
    <div class="form-group"><div class="form-label">Client</div><input class="form-input" id="fp-client" value="${escapeHtml(p.client || '')}" list="hq-client-list" placeholder="Client name" autocomplete="off"/></div>
    <div class="form-group"><div class="form-label">Value (₱)</div><input class="form-input" id="fp-value" type="number" value="${p.value || 0}"/></div>
    <div class="form-group"><div class="form-label">Date Sent</div><input class="form-input" id="fp-sent" type="date" value="${toISODate(p.sent)}"/></div>
    <div class="form-group"><div class="form-label">Follow-up Date</div><input class="form-input" id="fp-followup" type="date" value="${toISODate(p.followup)}"/></div>
    <div class="form-group"><div class="form-label">Status</div><select class="form-input" id="fp-status">${statusOpts}</select></div>
  </div>`;
}
