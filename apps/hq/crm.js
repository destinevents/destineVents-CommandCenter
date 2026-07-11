import { formatCurrency } from '../../shared/utils/formatUtils.ts';
import { formatDateShort, todayISO } from '../../shared/utils/dateUtils.ts';
import { escapeHtml, statusClass } from '../../shared/utils/helpers.ts';
import { validateRequired } from '../../shared/utils/validators.ts';
import { APP_SETTINGS } from '../../config/settings.js';
import {
  fetchClients, createClient, updateClient, deleteClient,
} from '../../shared/services/clientService.js';
import {
  fetchProposals, createProposal, updateProposal, deleteProposal, calcWinRate,
} from '../../shared/services/proposalService.js';
import { fetchProjects } from '../../shared/services/projectService.js';
import { fetchInvoices, createInvoice } from '../../shared/services/financeService.js';
import { _clients, _proposals, setClients, setProposals } from './state.js';
import { toast, openModal, closeModal } from './ui.js';

// ── Clients ──────────────────────────────────────────────────────────────────

let _editingClientId = null;

export async function loadClients() {
  setClients(await fetchClients());
  renderClients(_clients);
}

export function renderClients(clients) {
  const total = clients.reduce((s, c) => s + (c.total_value || 0), 0);
  document.getElementById('clients-summary').textContent =
    `${clients.length} clients · ${formatCurrency(total)} total value`;
  document.getElementById('clients-tbody').innerHTML = clients.length
    ? clients.map(c => `
        <tr>
          <td><div class="project-name">${escapeHtml(c.name)}</div><div class="project-client">${escapeHtml(c.type)}</div></td>
          <td><span class="badge badge-${statusClass(c.status)}">${escapeHtml(c.status)}</span></td>
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
        </tr>`).join('')
    : `<tr><td colspan="7"><div class="empty-state">No clients yet — add your first one</div></td></tr>`;
}

function clientFormHTML(c = {}) {
  const typeOpts    = APP_SETTINGS.finance.clientTypes.map(t => `<option${t === c.type ? ' selected' : ''}>${t}</option>`).join('');
  const brandOpts   = APP_SETTINGS.company.brands.map(b => `<option${b === c.brand ? ' selected' : ''}>${b}</option>`).join('');
  const statusOpts  = APP_SETTINGS.finance.clientStatuses.map(s => `<option${s === c.status ? ' selected' : ''}>${s}</option>`).join('');
  return `<div class="form-grid">
    <div class="form-group"><div class="form-label">Client Name</div><input class="form-input" id="fc-name" value="${escapeHtml(c.name || '')}" placeholder="e.g. DTI CAR"/></div>
    <div class="form-group"><div class="form-label">Type</div><select class="form-input" id="fc-type">${typeOpts}</select></div>
    <div class="form-group"><div class="form-label">Brand</div><select class="form-input" id="fc-brand">${brandOpts}</select></div>
    <div class="form-group"><div class="form-label">Status</div><select class="form-input" id="fc-status">${statusOpts}</select></div>
    <div class="form-group"><div class="form-label">Contact Person</div><input class="form-input" id="fc-contact" value="${escapeHtml(c.contact || '')}" placeholder="Full name"/></div>
    <div class="form-group"><div class="form-label">Email</div><input class="form-input" id="fc-email" type="email" value="${escapeHtml(c.email || '')}" placeholder="email@org.ph"/></div>
  </div>`;
}

export function openAddClient() {
  _editingClientId = null;
  openModal('Add Client', clientFormHTML(), saveClient);
}

export function openEditClient(id) {
  const c = _clients.find(x => x.id === id);
  if (!c) return;
  _editingClientId = id;
  openModal('Edit Client', clientFormHTML(c), saveClient);
}

export async function saveClient() {
  const name = document.getElementById('fc-name').value.trim();
  const err = validateRequired(name, 'Client name');
  if (err) { toast(err, 'error'); return; }
  const payload = {
    name,
    type:    document.getElementById('fc-type').value,
    brand:   document.getElementById('fc-brand').value,
    status:  document.getElementById('fc-status').value,
    contact: document.getElementById('fc-contact').value,
    email:   document.getElementById('fc-email').value,
  };
  if (_editingClientId) {
    const ok = await updateClient(_editingClientId, payload);
    if (!ok) { toast('Could not update client', 'error'); return; }
    toast('Client updated', 'success');
  } else {
    const result = await createClient({ ...payload, total_value: 0 });
    if (!result) return;
    toast('Client added', 'success');
  }
  closeModal();
  loadClients();
}

export async function handleDeleteClient(id) {
  if (!confirm('Delete this client? This cannot be undone.')) return;
  const ok = await deleteClient(id);
  if (!ok) { toast('Could not delete client', 'error'); return; }
  toast('Client deleted', '');
  loadClients();
}

// ── Proposals ─────────────────────────────────────────────────────────────────

let _editingProposalId = null;

export async function loadProposals() {
  const [proposals, clients] = await Promise.all([fetchProposals(), fetchClients()]);
  setProposals(proposals);
  setClients(clients || []);
  renderProposals(_proposals);
}

export function renderProposals(proposals) {
  const stats = calcWinRate(proposals);
  document.getElementById('win-rate-pct').textContent = stats.winRate + '%';
  document.getElementById('win-rate-breakdown').innerHTML =
    `<div>${stats.won} won · ${stats.lost} lost · ${stats.total - stats.closed} open</div>
     <div>Closed: <strong>${stats.closed} of ${stats.total}</strong></div>`;
  document.getElementById('proposals-value-summary').innerHTML =
    `<div>Total: <strong>${formatCurrency(stats.wonValue + stats.pipelineValue)}</strong></div>
     <div>Won: <strong style="color:var(--green)">${formatCurrency(stats.wonValue)}</strong></div>
     <div>In pipeline: <strong style="color:var(--blue)">${formatCurrency(stats.pipelineValue)}</strong></div>`;
  document.getElementById('proposals-summary').textContent = `${stats.total} proposals`;
  document.getElementById('proposals-tbody').innerHTML = proposals.length
    ? proposals.map(p => `
        <tr>
          <td><div class="project-name">${escapeHtml(p.name)}</div><div class="project-client">${escapeHtml(p.client)}</div></td>
          <td class="project-value">${formatCurrency(p.value)}</td>
          <td style="font-size:11px;color:var(--ink-3)">${displayDate(p.sent)}</td>
          <td style="font-size:11px;color:var(--ink-3)">${displayDate(p.followup)}</td>
          <td><span class="badge badge-${statusClass(p.status)}">${escapeHtml(p.status)}</span></td>
          <td>
            <div class="flex-gap" style="gap:4px;flex-wrap:wrap">
              ${p.status === 'Won' ? `<button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--green)" onclick="convertProposalToProject(${p.id})">→ Project</button>` : ''}
              ${p.status === 'Won' ? `<button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--blue)" onclick="openProposalInvoice(${p.id})">→ Invoice</button>` : ''}
              <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="openEditProposal(${p.id})">Edit</button>
              <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--red)" onclick="handleDeleteProposal(${p.id})">Delete</button>
            </div>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="6"><div class="empty-state">No proposals yet</div></td></tr>`;
}

function toISODate(val) {
  if (!val || val === '—') return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function displayDate(val) {
  if (!val || val === '—') return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return formatDateShort(val);
  return escapeHtml(String(val));
}

function proposalFormHTML(p = {}) {
  const statusOpts = APP_SETTINGS.finance.proposalStatuses.map(s => `<option${s === p.status ? ' selected' : ''}>${s}</option>`).join('');
  const clientOpts = _clients.map(c => `<option value="${escapeHtml(c.name)}"/>`).join('');
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

export function openAddProposal() {
  _editingProposalId = null;
  openModal('New Proposal', proposalFormHTML(), saveProposal);
}

export function openEditProposal(id) {
  const p = _proposals.find(x => x.id === id);
  if (!p) return;
  _editingProposalId = id;
  openModal('Edit Proposal', proposalFormHTML(p), saveProposal);
}

export async function saveProposal() {
  const name = document.getElementById('fp-name').value.trim();
  const err = validateRequired(name, 'Proposal name');
  if (err) { toast(err, 'error'); return; }
  const payload = {
    name,
    client:   document.getElementById('fp-client').value,
    value:    +document.getElementById('fp-value').value || 0,
    sent:     document.getElementById('fp-sent').value || null,
    followup: document.getElementById('fp-followup').value || null,
    status:   document.getElementById('fp-status').value,
  };
  if (_editingProposalId) {
    const ok = await updateProposal(_editingProposalId, payload);
    if (!ok) { toast('Could not update proposal', 'error'); return; }
    toast('Proposal updated', 'success');
  } else {
    const result = await createProposal(payload);
    if (!result) return;
    toast('Proposal added', 'success');
  }
  closeModal();
  loadProposals();
}

export async function handleDeleteProposal(id) {
  if (!confirm('Delete this proposal? This cannot be undone.')) return;
  const ok = await deleteProposal(id);
  if (!ok) { toast('Could not delete proposal', 'error'); return; }
  toast('Proposal deleted', '');
  loadProposals();
}

// ── Proposal → Invoice shortcut ──────────────────────────────────────────────

export function openProposalInvoice(proposalId) {
  const p = _proposals.find(x => x.id === proposalId);
  if (!p) return;
  openModal('Issue Invoice (from Proposal)', `<div class="form-grid">
    <div class="form-group"><div class="form-label">OR Number</div><input class="form-input" id="piv-or" placeholder="OR-2026-001"/></div>
    <div class="form-group"><div class="form-label">Client</div><input class="form-input" id="piv-client" value="${escapeHtml(p.client || '')}" /></div>
    <div class="form-group"><div class="form-label">Amount (₱)</div><input class="form-input" id="piv-amount" type="number" value="${p.value || 0}" min="0"/></div>
    <div class="form-group"><div class="form-label">Status</div>
      <select class="form-input" id="piv-status"><option>Unpaid</option><option>Paid</option></select>
    </div>
    <div class="form-group"><div class="form-label">Date Issued</div><input class="form-input" id="piv-date" type="date" value="${todayISO()}"/></div>
    <div class="form-group"><div class="form-label">Due Date</div><input class="form-input" id="piv-due" type="date"/></div>
    <div class="form-group full" style="font-size:11px;color:var(--ink-3)">Proposal: <strong>${escapeHtml(p.name)}</strong> · ${formatCurrency(p.value)}</div>
  </div>`, async () => {
    const or_num = document.getElementById('piv-or').value.trim();
    if (!or_num) { toast('OR number is required', 'error'); return; }
    const result = await createInvoice({
      or_num,
      client: document.getElementById('piv-client').value.trim(),
      amount: +document.getElementById('piv-amount').value || 0,
      status: document.getElementById('piv-status').value,
      date:   document.getElementById('piv-date').value || null,
      due:    document.getElementById('piv-due').value || null,
    });
    if (!result) return;
    toast('Invoice created — check Finance › AR', 'success');
    closeModal();
  });
}

// ── Client detail view ────────────────────────────────────────────────────────

export async function openClientDetail(id) {
  const c = _clients.find(x => x.id === id);
  if (!c) return;
  openModal(c.name, '<div style="padding:16px;text-align:center;color:var(--ink-3);font-size:12px">Loading…</div>', closeModal, 'Close');
  const [proposals, projects, invoices] = await Promise.all([
    fetchProposals(), fetchProjects(), fetchInvoices(),
  ]);
  const match     = n => n?.toLowerCase() === c.name.toLowerCase();
  const cProps    = proposals.filter(p => match(p.client));
  const cProjs    = projects.filter(p => match(p.client));
  const cInvs     = invoices.filter(i => match(i.client));
  const totalPaid = cInvs.filter(i => i.status === 'Paid').reduce((s, i) => s + (i.amount || 0), 0);
  const totalOwed = cInvs.filter(i => i.status !== 'Paid').reduce((s, i) => s + (i.amount || 0), 0);

  const dot = (st) => {
    if (st === 'Won' || st === 'Active' || st === 'Paid') return 'green';
    if (st === 'Lost' || st === 'Overdue') return 'red';
    return 'blue';
  };

  document.getElementById('modal-body').innerHTML = `
    <div style="margin-bottom:12px">
      <span class="badge badge-${statusClass(c.status)}">${escapeHtml(c.status)}</span>
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
        <div class="activity-dot ${dot(p.status)}"></div>
        <div style="flex:1"><div class="activity-text">${escapeHtml(p.name)}</div><div class="activity-time">${displayDate(p.sent)}</div></div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-family:'Cormorant Garamond',serif;font-size:13px">${formatCurrency(p.value)}</span>
          <span class="badge badge-${statusClass(p.status)}">${escapeHtml(p.status)}</span>
        </div>
      </div>`).join('') : '<div style="font-size:11px;color:var(--ink-3);padding:4px 0 10px">No proposals</div>'}

    <div class="card-title" style="margin:12px 0 6px">Projects (${cProjs.length})</div>
    ${cProjs.length ? cProjs.map(p => `
      <div class="activity-item">
        <div class="activity-dot ${dot(p.status)}"></div>
        <div style="flex:1"><div class="activity-text">${escapeHtml(p.name)}</div><div class="activity-time">${escapeHtml(p.category || '—')} · ${escapeHtml(p.brand || '—')}</div></div>
        <span class="badge badge-${statusClass(p.status)}">${escapeHtml(p.status)}</span>
      </div>`).join('') : '<div style="font-size:11px;color:var(--ink-3);padding:4px 0 10px">No projects</div>'}

    <div class="card-title" style="margin:12px 0 6px">Invoices (${cInvs.length})</div>
    ${cInvs.length ? cInvs.map(i => `
      <div class="activity-item">
        <div class="activity-dot ${dot(i.status)}"></div>
        <div style="flex:1"><div class="activity-text">${escapeHtml(i.or_num)}</div><div class="activity-time">${displayDate(i.date)}</div></div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-family:'Cormorant Garamond',serif;font-size:13px">${formatCurrency(i.amount)}</span>
          <span class="badge badge-${statusClass(i.status)}">${escapeHtml(i.status)}</span>
        </div>
      </div>`).join('') : '<div style="font-size:11px;color:var(--ink-3);padding:4px 0">No invoices</div>'}`;
}
