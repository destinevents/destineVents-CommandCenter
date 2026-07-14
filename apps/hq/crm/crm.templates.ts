import type { Client, Proposal, Project, Invoice } from '@shared/types.ts';
import { escapeHtml, statusClass } from '@shared/utils/helpers.ts';
import { formatCurrency } from '@shared/utils/formatUtils.ts';
import { formatDateShort } from '@shared/utils/dateUtils.ts';
import { APP_SETTINGS } from '@config/settings.js';

// ── Date helpers ──────────────────────────────────────────────────────────────

export function toISODate(val: string | null | undefined): string {
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

// ── Client templates ──────────────────────────────────────────────────────────

export function clientRowHTML(c: Client): string {
  return `
    <tr>
      <td><div class="project-name">${escapeHtml(c.name)}</div><div class="project-client">${escapeHtml(c.type)}</div></td>
      <td><span class="badge badge-${statusClass(c.status ?? '')}">${escapeHtml(c.status)}</span></td>
      <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(c.brand) || '—'}</td>
      <td style="font-size:12px">${escapeHtml(c.contact) || '—'}</td>
      <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(c.email) || '—'}</td>
      <td class="project-value">${formatCurrency(c.total_value)}</td>
      <td>
        <div class="flex-gap" style="gap:4px">
          <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="openClientDetail(${c.id})">View</button>
          <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="openEditClient(${c.id})">Edit</button>
          <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--red)" onclick="handleDeleteClient(${c.id})">Delete</button>
        </div>
      </td>
    </tr>`;
}

export function clientTableHTML(clients: Client[]): string {
  return clients.length
    ? clients.map(clientRowHTML).join('')
    : `<tr><td colspan="7"><div class="empty-state">No clients yet — add your first one</div></td></tr>`;
}

export function clientFormHTML(c: Partial<Client> = {}): string {
  const typeOpts   = APP_SETTINGS.finance.clientTypes.map((t: string) => `<option${t === c.type ? ' selected' : ''}>${t}</option>`).join('');
  const brandOpts  = APP_SETTINGS.company.brands.map((b: string) => `<option${b === c.brand ? ' selected' : ''}>${b}</option>`).join('');
  const statusOpts = APP_SETTINGS.finance.clientStatuses.map((s: string) => `<option${s === c.status ? ' selected' : ''}>${s}</option>`).join('');
  return `<div class="form-grid">
    <div class="form-group"><div class="form-label">Client Name</div><input class="form-input" id="fc-name" value="${escapeHtml(c.name || '')}" placeholder="e.g. DTI CAR"/></div>
    <div class="form-group"><div class="form-label">Type</div><select class="form-input" id="fc-type">${typeOpts}</select></div>
    <div class="form-group"><div class="form-label">Brand</div><select class="form-input" id="fc-brand">${brandOpts}</select></div>
    <div class="form-group"><div class="form-label">Status</div><select class="form-input" id="fc-status">${statusOpts}</select></div>
    <div class="form-group"><div class="form-label">Contact Person</div><input class="form-input" id="fc-contact" value="${escapeHtml(c.contact || '')}" placeholder="Full name"/></div>
    <div class="form-group"><div class="form-label">Email</div><input class="form-input" id="fc-email" type="email" value="${escapeHtml(c.email || '')}" placeholder="email@org.ph"/></div>
  </div>`;
}

// ── Client detail template ────────────────────────────────────────────────────

function activityDot(status: string): string {
  if (status === 'Won' || status === 'Active' || status === 'Paid') return 'green';
  if (status === 'Lost' || status === 'Overdue') return 'red';
  return 'blue';
}

export function clientDetailHTML(
  c: Client,
  proposals: Proposal[],
  projects: Project[],
  invoices: Invoice[],
): string {
  const match     = (n: string | null | undefined) => n?.toLowerCase() === c.name.toLowerCase();
  const cProps    = proposals.filter(p => match(p.client));
  const cProjs    = projects.filter(p => match(p.client));
  const cInvs     = invoices.filter(i => match(i.client));
  const totalPaid = cInvs.filter(i => i.status === 'Paid').reduce((s, i) => s + (i.amount || 0), 0);
  const totalOwed = cInvs.filter(i => i.status !== 'Paid').reduce((s, i) => s + (i.amount || 0), 0);

  return `
    <div style="margin-bottom:12px">
      <span class="badge badge-${statusClass(c.status ?? '')}">${escapeHtml(c.status)}</span>
      <span style="font-size:11px;color:var(--ink-3);margin-left:8px">${escapeHtml(c.type)} · ${escapeHtml(c.brand || '—')}</span>
      ${c.contact ? `<span style="font-size:11px;color:var(--ink-3);margin-left:8px">· ${escapeHtml(c.contact)}</span>` : ''}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
      <div class="stat-card" style="padding:10px 12px"><div class="stat-label">Revenue Paid</div><div style="font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:700;color:var(--green)">${formatCurrency(totalPaid)}</div></div>
      <div class="stat-card" style="padding:10px 12px"><div class="stat-label">Outstanding</div><div style="font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:700;${totalOwed > 0 ? 'color:var(--amber)' : ''}">${formatCurrency(totalOwed)}</div></div>
    </div>

    <div class="card-title" style="margin-bottom:6px">Proposals (${cProps.length})</div>
    ${cProps.length ? cProps.map(p => `
      <div class="activity-item">
        <div class="activity-dot ${activityDot(p.status)}"></div>
        <div style="flex:1"><div class="activity-text">${escapeHtml(p.name)}</div><div class="activity-time">${displayDate(p.sent)}</div></div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-family:'Cormorant Garamond',serif;font-size:13px">${formatCurrency(p.value)}</span>
          <span class="badge badge-${statusClass(p.status)}">${escapeHtml(p.status)}</span>
        </div>
      </div>`).join('') : '<div style="font-size:11px;color:var(--ink-3);padding:4px 0 10px">No proposals</div>'}

    <div class="card-title" style="margin:12px 0 6px">Projects (${cProjs.length})</div>
    ${cProjs.length ? cProjs.map(p => `
      <div class="activity-item">
        <div class="activity-dot ${activityDot(p.status)}"></div>
        <div style="flex:1"><div class="activity-text">${escapeHtml(p.name)}</div><div class="activity-time">${escapeHtml(p.category || '—')} · ${escapeHtml(p.brand || '—')}</div></div>
        <span class="badge badge-${statusClass(p.status)}">${escapeHtml(p.status)}</span>
      </div>`).join('') : '<div style="font-size:11px;color:var(--ink-3);padding:4px 0 10px">No projects</div>'}

    <div class="card-title" style="margin:12px 0 6px">Invoices (${cInvs.length})</div>
    ${cInvs.length ? cInvs.map(i => `
      <div class="activity-item">
        <div class="activity-dot ${activityDot(i.status)}"></div>
        <div style="flex:1"><div class="activity-text">${escapeHtml(i.or_num)}</div><div class="activity-time">${displayDate(i.date)}</div></div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-family:'Cormorant Garamond',serif;font-size:13px">${formatCurrency(i.amount)}</span>
          <span class="badge badge-${statusClass(i.status)}">${escapeHtml(i.status)}</span>
        </div>
      </div>`).join('') : '<div style="font-size:11px;color:var(--ink-3);padding:4px 0">No invoices</div>'}`;
}

// ── Proposal templates ────────────────────────────────────────────────────────

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
