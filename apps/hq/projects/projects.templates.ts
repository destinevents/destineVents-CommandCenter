import type { Client, Project, Proposal, Invoice } from '@shared/types.ts';
import { escapeHtml, statusClass } from '@shared/utils/helpers.ts';
import { formatCurrency } from '@shared/utils/formatUtils.ts';
import { formatDateShort } from '@shared/utils/dateUtils.ts';
import { APP_SETTINGS } from '@config/settings.ts';

function activityDot(status: string): string {
  if (status === 'Won' || status === 'Active' || status === 'Paid') return 'green';
  if (status === 'Lost' || status === 'Overdue') return 'red';
  return 'blue';
}

// ── Project list templates ────────────────────────────────────────────────────

export function projectRowHTML(p: Project): string {
  return `
    <tr>
      <td>
        <div class="project-name">${escapeHtml(p.name)}</div>
        <div class="project-client">${escapeHtml(p.client || '—')}</div>
      </td>
      <td><span class="badge badge-${statusClass(p.status)}">${escapeHtml(p.status)}</span></td>
      <td style="font-size:11.5px;color:var(--ink-3)">${escapeHtml(p.category || '—')}</td>
      <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(p.brand || '—')}</td>
      <td class="project-value">${formatCurrency(p.value)}</td>
      <td style="font-size:10.5px;color:var(--ink-3)">${formatDateShort((p.updated_at || p.created_at || '').slice(0, 10))}</td>
      <td>
        <div class="flex-gap" style="gap:4px;flex-wrap:wrap">
          <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="openProjectDetail(${p.id})">View</button>
          <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="openEditProject(${p.id})">Edit</button>
          <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--red)" onclick="handleDeleteProject(${p.id})">Delete</button>
        </div>
      </td>
    </tr>`;
}

export function projectTableHTML(projects: Project[]): string {
  return projects.length
    ? projects.map(projectRowHTML).join('')
    : `<tr><td colspan="7"><div class="empty-state">No projects yet — start one with \\ New Project</div></td></tr>`;
}

// ── Project form template ─────────────────────────────────────────────────────

export function projectFormHTML(clients: Client[], p: Partial<Project> = {}): string {
  const brands     = (APP_SETTINGS.company.brands || ['DestineVents', 'DDC', 'AYA Baguio']).map((b: string) => `<option${b === p.brand ? ' selected' : ''}>${escapeHtml(b)}</option>`).join('');
  const statuses   = ['Lead', 'Proposal Sent', 'NDA Signed', 'Proposal Approved', 'Active', 'Completed'].map(s => `<option${s === p.status ? ' selected' : ''}>${s}</option>`).join('');
  const cats       = ['Events', 'Training', 'Digital', 'CSR', 'Community'].map(c => `<option${c === p.category ? ' selected' : ''}>${c}</option>`).join('');
  const clientOpts = clients.map(c => `<option value="${escapeHtml(c.name)}"/>`).join('');
  return `
    <datalist id="hq-client-list">${clientOpts}</datalist>
    <div id="fp2-error" class="modal-error"></div>
    <div class="form-grid">
      <div class="form-group full"><div class="form-label">Project Name</div><input class="form-input" id="fp2-name" value="${escapeHtml(p.name || '')}" placeholder="e.g. DTI MSME Innovation Summit"/></div>
      <div class="form-group"><div class="form-label">Client</div><input class="form-input" id="fp2-client" value="${escapeHtml(p.client || '')}" list="hq-client-list" placeholder="Client / org name" autocomplete="off"/></div>
      <div class="form-group"><div class="form-label">Value (₱)</div><input class="form-input" id="fp2-value" type="number" value="${p.value || 0}" min="0"/></div>
      <div class="form-group"><div class="form-label">Brand</div><select class="form-input" id="fp2-brand">${brands}</select></div>
      <div class="form-group"><div class="form-label">Category</div><select class="form-input" id="fp2-category">${cats}</select></div>
      <div class="form-group"><div class="form-label">Status</div><select class="form-input" id="fp2-status">${statuses}</select></div>
      <div class="form-group full"><div class="form-label">Notes</div><textarea class="form-input" id="fp2-notes" rows="2" placeholder="Any relevant details…">${escapeHtml(p.notes || '')}</textarea></div>
    </div>`;
}

export function newClientBannerHTML(clientName: string): string {
  return `
    <div id="new-client-banner" style="background:#fef9ec;border:1px solid var(--amber);border-radius:4px;padding:10px 14px;margin-bottom:16px;display:flex;align-items:center;gap:10px;font-size:12px">
      <span style="color:var(--amber);font-size:14px">⚠</span>
      <span style="flex:1"><strong>${escapeHtml(clientName)}</strong> is not in your client list yet.</span>
      <button class="btn btn-ghost" style="font-size:11px;padding:3px 10px" onclick="addClientFromProposal('${escapeHtml(clientName)}')">+ Add as Client</button>
    </div>`;
}

// ── Project detail template ───────────────────────────────────────────────────

export function projectDetailHTML(p: Project, proposals: Proposal[], invoices: Invoice[]): string {
  const match  = (n: string | null | undefined) => n?.toLowerCase() === (p.client || '').toLowerCase();
  const pProps = proposals.filter(x => match(x.client));
  const pInvs  = invoices.filter(i => match(i.client));
  const paid   = pInvs.filter(i => i.status === 'Paid').reduce((s, i) => s + (i.amount || 0), 0);
  const owed   = pInvs.filter(i => i.status !== 'Paid').reduce((s, i) => s + (i.amount || 0), 0);

  return `
    <div style="margin-bottom:12px">
      <span class="badge badge-${statusClass(p.status)}">${escapeHtml(p.status)}</span>
      <span style="font-size:11px;color:var(--ink-3);margin-left:8px">${escapeHtml(p.category || '—')} · ${escapeHtml(p.brand || '—')}</span>
      ${p.client ? `<span style="font-size:11px;color:var(--ink-3);margin-left:8px">· ${escapeHtml(p.client)}</span>` : ''}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px">
      <div class="stat-card" style="padding:10px 12px"><div class="stat-label">Project Value</div><div style="font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:700">${formatCurrency(p.value)}</div></div>
      <div class="stat-card" style="padding:10px 12px"><div class="stat-label">Revenue Paid</div><div style="font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:700;color:var(--green)">${formatCurrency(paid)}</div></div>
      <div class="stat-card" style="padding:10px 12px"><div class="stat-label">Outstanding</div><div style="font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:700;${owed > 0 ? 'color:var(--amber)' : ''}">${formatCurrency(owed)}</div></div>
    </div>
    ${p.notes ? `<div style="font-size:11.5px;color:var(--ink-2);margin-bottom:14px;padding:8px 10px;background:var(--ink-5);border-radius:6px">${escapeHtml(p.notes)}</div>` : ''}
    <div class="card-title" style="margin-bottom:6px">Client Proposals (${pProps.length})</div>
    ${pProps.length ? pProps.map(x => `
      <div class="activity-item">
        <div class="activity-dot ${activityDot(x.status)}"></div>
        <div style="flex:1"><div class="activity-text">${escapeHtml(x.name)}</div></div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-family:'Cormorant Garamond',serif;font-size:13px">${formatCurrency(x.value)}</span>
          <span class="badge badge-${statusClass(x.status)}">${escapeHtml(x.status)}</span>
        </div>
      </div>`).join('') : '<div style="font-size:11px;color:var(--ink-3);padding:4px 0 10px">No proposals for this client</div>'}
    <div class="card-title" style="margin:12px 0 6px">Client Invoices (${pInvs.length})</div>
    ${pInvs.length ? pInvs.map(i => `
      <div class="activity-item">
        <div class="activity-dot ${activityDot(i.status)}"></div>
        <div style="flex:1"><div class="activity-text">${escapeHtml(i.or_num)}</div></div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-family:'Cormorant Garamond',serif;font-size:13px">${formatCurrency(i.amount)}</span>
          <span class="badge badge-${statusClass(i.status)}">${escapeHtml(i.status)}</span>
        </div>
      </div>`).join('') : '<div style="font-size:11px;color:var(--ink-3);padding:4px 0">No invoices for this client</div>'}`;
}
