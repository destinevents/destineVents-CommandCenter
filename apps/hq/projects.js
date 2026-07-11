import { formatCurrency } from '../../shared/utils/formatUtils.ts';
import { formatDateShort, todayISO } from '../../shared/utils/dateUtils.ts';
import { escapeHtml, statusClass } from '../../shared/utils/helpers.ts';
import { validateRequired } from '../../shared/utils/validators.ts';
import { APP_SETTINGS } from '../../config/settings.js';
import {
  fetchProjects, createProject, updateProject, deleteProject,
} from '../../shared/services/projectService.js';
import { fetchClients } from '../../shared/services/clientService.js';
import { fetchProposals } from '../../shared/services/proposalService.js';
import { fetchInvoices, createInvoice } from '../../shared/services/financeService.js';
import { _clients, _proposals, _projects, setClients, setProjects } from './state.js';
import { toast, openModal, closeModal } from './ui.js';

let _editingProjectId = null;

export async function loadProjects() {
  const [projs, clients] = await Promise.all([fetchProjects(), fetchClients()]);
  setProjects(projs);
  setClients(clients || []);
  renderProjects(_projects);
}

export function renderProjects(projects) {
  const total = projects.reduce((s, p) => s + (p.value || 0), 0);
  document.getElementById('projects-summary').textContent =
    `${projects.length} project${projects.length !== 1 ? 's' : ''} · ${formatCurrency(total)} total value`;

  document.getElementById('projects-tbody').innerHTML = projects.length
    ? projects.map(p => `
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
              <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--blue)" onclick="openProjectInvoice(${p.id})">→ Invoice</button>
              <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="openEditProject(${p.id})">Edit</button>
              <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--red)" onclick="handleDeleteProject(${p.id})">Delete</button>
            </div>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="7"><div class="empty-state">No projects yet — start one with \\ New Project</div></td></tr>`;
}

function projectFormHTML(p = {}) {
  const brands      = (APP_SETTINGS.company.brands || ['DestineVents', 'DDC', 'AYA Baguio']).map(b => `<option${b === p.brand ? ' selected' : ''}>${escapeHtml(b)}</option>`).join('');
  const statuses    = ['Lead', 'Proposal Sent', 'NDA Signed', 'Active', 'Completed'].map(s => `<option${s === p.status ? ' selected' : ''}>${s}</option>`).join('');
  const cats        = ['Events', 'Training', 'Digital', 'CSR', 'Community'].map(c => `<option${c === p.category ? ' selected' : ''}>${c}</option>`).join('');
  const clientOpts  = _clients.map(c => `<option value="${escapeHtml(c.name)}"/>`).join('');
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

function showProjectError(msg) {
  const el = document.getElementById('fp2-error');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('visible');
}

export function openAddProject() {
  _editingProjectId = null;
  openModal('New Project', projectFormHTML(), saveProject);
}

export function openEditProject(id) {
  const p = _projects.find(x => x.id === id);
  if (!p) return;
  _editingProjectId = id;
  openModal('Edit Project', projectFormHTML(p), saveProject);
}

export async function saveProject() {
  const name = document.getElementById('fp2-name').value.trim();
  const err  = validateRequired(name, 'Project name');
  if (err) { showProjectError(err); return; }
  const payload = {
    name,
    client:   document.getElementById('fp2-client').value.trim(),
    value:    +document.getElementById('fp2-value').value || 0,
    brand:    document.getElementById('fp2-brand').value,
    category: document.getElementById('fp2-category').value,
    status:   document.getElementById('fp2-status').value,
    notes:    document.getElementById('fp2-notes').value.trim(),
  };
  if (_editingProjectId) {
    const ok = await updateProject(_editingProjectId, payload);
    if (!ok) { showProjectError('Could not update project. Please try again.'); return; }
    toast('Project updated', 'success');
  } else {
    const result = await createProject({ ...payload, updated_at: new Date().toISOString() });
    if (!result.ok) { showProjectError(result.message || 'Could not save project. Please try again.'); return; }
    toast('Project added', 'success');
  }
  closeModal();
  loadProjects();
}

export async function handleDeleteProject(id) {
  if (!confirm('Delete this project? This cannot be undone.')) return;
  const ok = await deleteProject(id);
  if (!ok) { toast('Could not delete project', 'error'); return; }
  toast('Project deleted', '');
  loadProjects();
}

// ── Project detail view ───────────────────────────────────────────────────────

export async function openProjectDetail(id) {
  const p = _projects.find(x => x.id === id);
  if (!p) return;
  openModal(p.name, '<div style="padding:16px;text-align:center;color:var(--ink-3);font-size:12px">Loading…</div>', closeModal, 'Close');
  const [proposals, invoices] = await Promise.all([fetchProposals(), fetchInvoices()]);
  const match   = n => n?.toLowerCase() === (p.client || '').toLowerCase();
  const pProps  = proposals.filter(x => match(x.client));
  const pInvs   = invoices.filter(i => match(i.client));
  const paid    = pInvs.filter(i => i.status === 'Paid').reduce((s, i) => s + (i.amount || 0), 0);
  const owed    = pInvs.filter(i => i.status !== 'Paid').reduce((s, i) => s + (i.amount || 0), 0);
  const dot     = st => (st === 'Won' || st === 'Active' || st === 'Paid') ? 'green' : (st === 'Lost' || st === 'Overdue') ? 'red' : 'blue';

  document.getElementById('modal-body').innerHTML = `
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
        <div class="activity-dot ${dot(x.status)}"></div>
        <div style="flex:1"><div class="activity-text">${escapeHtml(x.name)}</div></div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-family:'Cormorant Garamond',serif;font-size:13px">${formatCurrency(x.value)}</span>
          <span class="badge badge-${statusClass(x.status)}">${escapeHtml(x.status)}</span>
        </div>
      </div>`).join('') : '<div style="font-size:11px;color:var(--ink-3);padding:4px 0 10px">No proposals for this client</div>'}
    <div class="card-title" style="margin:12px 0 6px">Client Invoices (${pInvs.length})</div>
    ${pInvs.length ? pInvs.map(i => `
      <div class="activity-item">
        <div class="activity-dot ${dot(i.status)}"></div>
        <div style="flex:1"><div class="activity-text">${escapeHtml(i.or_num)}</div></div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-family:'Cormorant Garamond',serif;font-size:13px">${formatCurrency(i.amount)}</span>
          <span class="badge badge-${statusClass(i.status)}">${escapeHtml(i.status)}</span>
        </div>
      </div>`).join('') : '<div style="font-size:11px;color:var(--ink-3);padding:4px 0">No invoices for this client</div>'}`;
}

// ── Project → Invoice shortcut ────────────────────────────────────────────────

export function openProjectInvoice(id) {
  const p = _projects.find(x => x.id === id);
  if (!p) return;
  openModal('Issue Invoice (from Project)', `<div class="form-grid">
    <div class="form-group"><div class="form-label">OR Number</div><input class="form-input" id="priv-or" placeholder="OR-2026-001"/></div>
    <div class="form-group"><div class="form-label">Client</div><input class="form-input" id="priv-client" value="${escapeHtml(p.client || '')}" /></div>
    <div class="form-group"><div class="form-label">Amount (₱)</div><input class="form-input" id="priv-amount" type="number" value="${p.value || 0}" min="0"/></div>
    <div class="form-group"><div class="form-label">Status</div>
      <select class="form-input" id="priv-status"><option>Unpaid</option><option>Paid</option></select>
    </div>
    <div class="form-group"><div class="form-label">Date Issued</div><input class="form-input" id="priv-date" type="date" value="${todayISO()}"/></div>
    <div class="form-group"><div class="form-label">Due Date</div><input class="form-input" id="priv-due" type="date"/></div>
    <div class="form-group full" style="font-size:11px;color:var(--ink-3)">Project: <strong>${escapeHtml(p.name)}</strong> · ${formatCurrency(p.value)}</div>
  </div>`, async () => {
    const or_num = document.getElementById('priv-or').value.trim();
    if (!or_num) { toast('OR number is required', 'error'); return; }
    const result = await createInvoice({
      or_num,
      client:     document.getElementById('priv-client').value.trim(),
      amount:     +document.getElementById('priv-amount').value || 0,
      status:     document.getElementById('priv-status').value,
      date:       document.getElementById('priv-date').value || null,
      due:        document.getElementById('priv-due').value || null,
      project_id: p.id,
    });
    if (!result) return;
    toast('Invoice created — check Finance › AR', 'success');
    closeModal();
  });
}

export function convertProposalToProject(proposalId) {
  const p = _proposals.find(x => x.id === proposalId);
  if (!p) return;
  _editingProjectId = null;
  openModal('New Project (from Proposal)', projectFormHTML({
    name:   p.name,
    client: p.client,
    value:  p.value,
    status: 'Active',
  }), saveProject);
}
