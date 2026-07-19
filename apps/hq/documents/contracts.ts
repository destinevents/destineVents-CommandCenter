import { formatCurrency } from '@shared/utils/formatUtils.ts';
import { escapeHtml } from '@shared/utils/helpers.ts';
import { validateRequired } from '@shared/utils/validators.ts';
import { APP_SETTINGS } from '@config/settings.ts';
import { nextDocNumber } from '@shared/services/documents/docNumberService.ts';
import { logDocActivity } from '@shared/services/documents/activityLogService.ts';
import { getCurrentUser } from '@shared/core/authService.ts';
import { buildDocPDF, docPDFSignatureBlock } from '@shared/documents/pdfTemplate.ts';
import {
  fetchContracts, createContract, updateContract, deleteContract,
} from '@shared/services/documents/contractService.ts';
import { _projects } from '@hq/core/state.ts';
import { toast, openModal, closeModal } from '@hq/core/ui.ts';
import type { Contract } from '@shared/types.ts';

// ── Module state ──────────────────────────────────────────────────────────────

let _contracts: Contract[] = [];
let _editingContractId: number | null = null;
let _contractFilterStatus = '';
let _contractFilterSearch = '';

export function getContracts(): Contract[] { return _contracts; }

const CON_STATUSES  = ['Draft', 'Sent', 'Signed', 'Active', 'Completed', 'Terminated'];
const CON_STATUS_CLASS: Record<string, string> = {
  'Draft':      'draft',
  'Sent':       'sent',
  'Signed':     'signed',
  'Active':     'active',
  'Completed':  'completed',
  'Terminated': 'cancelled',
};

// ── Load & render ─────────────────────────────────────────────────────────────

export async function loadContracts() {
  _contracts = await fetchContracts();
  renderContracts();
}

export function renderContracts() {
  const container = document.getElementById('vdtab-contracts');
  if (!container) return;

  const active = _contracts.filter(c => !c.archived_at);

  const draftCount   = active.filter(c => c.status === 'Draft').length;
  const sentCount    = active.filter(c => c.status === 'Sent').length;
  const signedCount  = active.filter(c => c.status === 'Signed').length;
  const activeConts  = active.filter(c => c.status === 'Active');

  let filtered = active;
  if (_contractFilterStatus) filtered = filtered.filter(c => c.status === _contractFilterStatus);
  if (_contractFilterSearch) filtered = filtered.filter(c =>
    c.title.toLowerCase().includes(_contractFilterSearch) ||
    c.client.toLowerCase().includes(_contractFilterSearch) ||
    c.con_number.toLowerCase().includes(_contractFilterSearch)
  );

  const hasFilters = !!(_contractFilterStatus || _contractFilterSearch);
  const totalValue = activeConts.reduce((s, c) => s + c.value, 0);

  container.innerHTML = `
    <div class="finance-stat-grid" style="margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">Draft / Sent</div>
        <div class="stat-value" style="font-size:22px">${draftCount + sentCount}</div>
        <div class="stat-change">${draftCount} draft · ${sentCount} sent</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Awaiting Signature</div>
        <div class="stat-value" style="font-size:22px;color:var(--amber)">${signedCount}</div>
        <div class="stat-change">signed, pending activation</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active Contracts</div>
        <div class="stat-value" style="font-size:22px;color:var(--green)">${activeConts.length}</div>
        <div class="stat-change">${formatCurrency(totalValue)} total value</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Contracts</div>
        <div class="stat-value" style="font-size:22px">${active.length}</div>
        <div class="stat-change">excluding archived</div>
      </div>
    </div>

    <div class="page-actions" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;gap:8px;flex:1;flex-wrap:wrap;align-items:center">
        <input class="form-input" id="con-filter-search" placeholder="Search title, client or CON #…"
          value="${escapeHtml(_contractFilterSearch)}" oninput="setContractFilter()" style="width:240px"/>
        <select class="form-input" id="con-filter-status" onchange="setContractFilter()" style="width:160px">
          <option value="">All Statuses</option>
          ${CON_STATUSES.map(s => `<option${_contractFilterStatus === s ? ' selected' : ''}>${escapeHtml(s)}</option>`).join('')}
        </select>
        ${hasFilters ? `<button class="btn btn-ghost" onclick="clearContractFilters()" style="font-size:12px">Clear filters</button>` : ''}
      </div>
      <button class="btn btn-primary" onclick="openAddContract()">+ New Contract</button>
    </div>

    <div style="border:1px solid var(--ink-4);overflow:hidden">
      <table class="ledger-table">
        <thead>
          <tr>
            <th>CON #</th>
            <th>Title / Client</th>
            <th>Project</th>
            <th>Contract Date</th>
            <th>Value</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${filtered.length
            ? filtered.map(c => _contractRowHTML(c)).join('')
            : `<tr><td colspan="7"><div class="empty-state">${hasFilters ? 'No contracts match filters' : 'No contracts yet'}</div></td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function _contractRowHTML(c: Contract): string {
  const proj      = _projects.find(p => p.id === c.project_id);
  const statusCls = CON_STATUS_CLASS[c.status] ?? 'draft';

  let actions = '';
  if (c.status === 'Draft') {
    actions = `
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="openEditContract(${c.id})">Edit</button>
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--blue)" onclick="sendContract(${c.id})">Send</button>
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="printContract(${c.id})">PDF</button>
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--red)" onclick="handleDeleteContract(${c.id})">Delete</button>`;
  } else if (c.status === 'Sent') {
    actions = `
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--green)" onclick="markContractSigned(${c.id})">Mark Signed</button>
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="printContract(${c.id})">PDF</button>
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--red)" onclick="terminateContract(${c.id})">Terminate</button>`;
  } else if (c.status === 'Signed') {
    actions = `
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--green)" onclick="activateContract(${c.id})">Activate</button>
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="printContract(${c.id})">PDF</button>`;
  } else if (c.status === 'Active') {
    actions = `
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--green)" onclick="completeContract(${c.id})">Complete</button>
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="printContract(${c.id})">PDF</button>
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--red)" onclick="terminateContract(${c.id})">Terminate</button>`;
  } else if (c.status === 'Completed' || c.status === 'Terminated') {
    actions = `
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="printContract(${c.id})">PDF</button>
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--ink-3)" onclick="archiveContract(${c.id})">Archive</button>`;
  }

  return `<tr>
    <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(c.con_number)}</td>
    <td>
      <div style="font-weight:500;color:var(--ink)">${escapeHtml(c.title)}</div>
      <div style="font-size:11px;color:var(--ink-3)">${escapeHtml(c.client)}</div>
    </td>
    <td style="font-size:11px;color:var(--ink-3)">${proj ? escapeHtml(proj.name) : '—'}</td>
    <td style="font-size:11px;color:var(--ink-3)">${c.contract_date ?? '—'}</td>
    <td class="amount-cell">${formatCurrency(c.value)}</td>
    <td><span class="badge badge-${statusCls}">${escapeHtml(c.status)}</span></td>
    <td><div class="flex-gap" style="gap:4px">${actions}</div></td>
  </tr>`;
}

// ── Filters ───────────────────────────────────────────────────────────────────

export function setContractFilter() {
  _contractFilterStatus = (document.getElementById('con-filter-status') as HTMLSelectElement | null)?.value ?? '';
  _contractFilterSearch = (document.getElementById('con-filter-search') as HTMLInputElement  | null)?.value.toLowerCase() ?? '';
  renderContracts();
}

export function clearContractFilters() {
  _contractFilterStatus = '';
  _contractFilterSearch = '';
  renderContracts();
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function openAddContract() {
  _editingContractId = null;
  const conNum = nextDocNumber('CON', _contracts.map(c => c.con_number));
  const user   = await getCurrentUser();
  openModal('New Contract', _contractFormHTML({ con_number: conNum, status: 'Draft', prepared_by: user?.name ?? '' }), saveContract);
}

export async function openEditContract(id: number) {
  const c = _contracts.find(x => x.id === id);
  if (!c) return;
  _editingContractId = id;
  openModal('Edit Contract', _contractFormHTML(c), saveContract);
}

function _contractFormHTML(c: Partial<Contract> = {}): string {
  const statusOpts = CON_STATUSES.map(s => `<option${s === (c.status ?? 'Draft') ? ' selected' : ''}>${s}</option>`).join('');
  const projOpts   = `<option value="">— No project —</option>` +
    _projects.map(p => `<option value="${p.id}"${c.project_id === p.id ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('');

  return `<div class="form-grid">
    <div class="form-group"><div class="form-label">CON #</div><input class="form-input" id="fc-con-num" value="${escapeHtml(c.con_number ?? '')}" placeholder="Auto-generated" readonly/></div>
    <div class="form-group"><div class="form-label">Status</div><select class="form-input" id="fc-status">${statusOpts}</select></div>
    <div class="form-group full"><div class="form-label">Contract Title *</div><input class="form-input" id="fc-title" value="${escapeHtml(c.title ?? '')}" placeholder="e.g. Event Management Services Agreement"/></div>
    <div class="form-group"><div class="form-label">Client *</div><input class="form-input" id="fc-client" value="${escapeHtml(c.client ?? '')}" placeholder="Client name"/></div>
    <div class="form-group"><div class="form-label">Project (optional)</div><select class="form-input" id="fc-project">${projOpts}</select></div>
    <div class="form-group"><div class="form-label">Contract Date</div><input class="form-input" id="fc-contract-date" type="date" value="${c.contract_date ?? ''}"/></div>
    <div class="form-group"><div class="form-label">Start Date</div><input class="form-input" id="fc-start-date" type="date" value="${c.start_date ?? ''}"/></div>
    <div class="form-group"><div class="form-label">End Date</div><input class="form-input" id="fc-end-date" type="date" value="${c.end_date ?? ''}"/></div>
    <div class="form-group"><div class="form-label">Contract Value (₱)</div><input class="form-input" id="fc-value" type="number" min="0" step="0.01" value="${c.value ?? 0}"/></div>
    <div class="form-group"><div class="form-label">Prepared By</div><input class="form-input" id="fc-prepared-by" value="${escapeHtml(c.prepared_by ?? '')}" placeholder="Name of preparer"/></div>
    <div class="form-group"><div class="form-label">Signed By (Client)</div><input class="form-input" id="fc-signed-by" value="${escapeHtml(c.signed_by ?? '')}" placeholder="Client signatory name"/></div>
    <div class="form-group"><div class="form-label">Date Signed</div><input class="form-input" id="fc-signed-at" type="date" value="${c.signed_at ?? ''}"/></div>
    <div class="form-group full">
      <div class="form-label">Terms &amp; Conditions</div>
      <textarea class="form-input" id="fc-terms" rows="8" placeholder="Full contract body text — scope of services, payment terms, obligations, governing law…">${escapeHtml(c.terms ?? '')}</textarea>
    </div>
  </div>`;
}

export async function saveContract() {
  const title  = (document.getElementById('fc-title')  as HTMLInputElement).value.trim();
  const client = (document.getElementById('fc-client') as HTMLInputElement).value.trim();
  const err    = validateRequired(title, 'Contract title') || validateRequired(client, 'Client');
  if (err) { toast(err, 'error'); return; }

  const conNum  = (document.getElementById('fc-con-num') as HTMLInputElement).value.trim()
    || nextDocNumber('CON', _contracts.map(c => c.con_number));
  const projVal = (document.getElementById('fc-project') as HTMLSelectElement).value;

  const payload: Partial<Contract> = {
    con_number:    conNum,
    title,
    client,
    project_id:    projVal ? +projVal : null,
    contract_date: (document.getElementById('fc-contract-date') as HTMLInputElement).value || null,
    start_date:    (document.getElementById('fc-start-date')    as HTMLInputElement).value || null,
    end_date:      (document.getElementById('fc-end-date')      as HTMLInputElement).value || null,
    value:         +((document.getElementById('fc-value')       as HTMLInputElement).value) || 0,
    status:        (document.getElementById('fc-status')        as HTMLSelectElement).value,
    prepared_by:   (document.getElementById('fc-prepared-by')  as HTMLInputElement).value.trim()    || null,
    signed_by:     (document.getElementById('fc-signed-by')    as HTMLInputElement).value.trim()    || null,
    signed_at:     (document.getElementById('fc-signed-at')    as HTMLInputElement).value           || null,
    terms:         (document.getElementById('fc-terms')        as HTMLTextAreaElement).value.trim() || null,
  };

  const user  = await getCurrentUser();
  const actor = user?.name ?? user?.email ?? null;

  if (_editingContractId) {
    const ok = await updateContract(_editingContractId, payload);
    if (!ok) { toast('Could not update contract', 'error'); return; }
    toast('Contract updated', 'success');
    await logDocActivity('contract', _editingContractId, conNum, 'updated', actor);
  } else {
    const result = await createContract(payload);
    if (!result) { toast('Could not create contract. Please try again.', 'error'); return; }
    toast('Contract created', 'success');
    await logDocActivity('contract', result.id, conNum, 'created', actor);
  }

  closeModal();
  loadContracts();
}

export async function handleDeleteContract(id: number) {
  if (!confirm('Delete this contract? This cannot be undone.')) return;
  const ok = await deleteContract(id);
  if (!ok) { toast('Could not delete contract', 'error'); return; }
  toast('Contract deleted', '');
  loadContracts();
}

// ── Status transitions ────────────────────────────────────────────────────────

async function _updateStatus(id: number, status: string, action: string) {
  const c  = _contracts.find(x => x.id === id);
  const ok = await updateContract(id, { status });
  if (!ok) { toast('Could not update status', 'error'); return; }
  const user = await getCurrentUser();
  await logDocActivity('contract', id, c?.con_number ?? null, action as Parameters<typeof logDocActivity>[3], user?.name ?? user?.email ?? null);
  loadContracts();
}

export async function sendContract(id: number) {
  if (!confirm('Mark this contract as Sent to client?')) return;
  toast('Contract marked as Sent', 'success');
  await _updateStatus(id, 'Sent', 'sent');
}

export function markContractSigned(id: number) {
  const c = _contracts.find(x => x.id === id);
  if (!c) return;
  openModal('Record Signature', `
    <div class="form-grid">
      <div class="form-group full">
        <div class="form-label">Signed By (Client) *</div>
        <input class="form-input" id="cs-signed-by" value="${escapeHtml(c.signed_by ?? '')}" placeholder="Name of client signatory"/>
      </div>
      <div class="form-group">
        <div class="form-label">Date Signed</div>
        <input class="form-input" id="cs-signed-at" type="date" value="${c.signed_at ?? new Date().toISOString().slice(0, 10)}"/>
      </div>
    </div>`,
    async () => {
      const signedBy = (document.getElementById('cs-signed-by') as HTMLInputElement).value.trim();
      if (!signedBy) { toast('Signatory name is required', 'error'); return; }
      const signedAt = (document.getElementById('cs-signed-at') as HTMLInputElement).value || null;
      const ok = await updateContract(id, { status: 'Signed', signed_by: signedBy, signed_at: signedAt });
      if (!ok) { toast('Could not update contract', 'error'); return; }
      toast('Contract marked as Signed', 'success');
      await logDocActivity('contract', id, c.con_number, 'signed', signedBy);
      closeModal();
      loadContracts();
    },
    'Mark Signed',
  );
}

export async function activateContract(id: number) {
  if (!confirm('Activate this contract?')) return;
  toast('Contract activated', 'success');
  await _updateStatus(id, 'Active', 'approved');
}

export async function completeContract(id: number) {
  if (!confirm('Mark this contract as Completed?')) return;
  toast('Contract completed', 'success');
  await _updateStatus(id, 'Completed', 'fulfilled');
}

export async function terminateContract(id: number) {
  if (!confirm('Terminate this contract?')) return;
  toast('Contract terminated', '');
  await _updateStatus(id, 'Terminated', 'cancelled');
}

export async function archiveContract(id: number) {
  if (!confirm('Archive this contract?')) return;
  const c  = _contracts.find(x => x.id === id);
  const ok = await updateContract(id, { archived_at: new Date().toISOString() } as Partial<Contract>);
  if (!ok) { toast('Could not archive contract', 'error'); return; }
  toast('Contract archived', '');
  const user = await getCurrentUser();
  await logDocActivity('contract', id, c?.con_number ?? null, 'archived', user?.name ?? user?.email ?? null);
  loadContracts();
}

// ── PDF ───────────────────────────────────────────────────────────────────────

export async function printContract(id: number) {
  const c = _contracts.find(x => x.id === id);
  if (!c) return;
  const { company } = APP_SETTINGS;
  const proj        = _projects.find(p => p.id === c.project_id);
  const statusCls   = CON_STATUS_CLASS[c.status] ?? 'draft';

  const body = `
<div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-bottom:28px">
  <div>
    <div class="label">Client / Party A</div>
    <div class="value" style="font-weight:600">${escapeHtml(c.client)}</div>
  </div>
  <div>
    <div class="label">Service Provider / Party B</div>
    <div class="value" style="font-weight:600">${escapeHtml(company.name)}</div>
  </div>
</div>
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:28px">
  ${c.contract_date ? `<div><div class="label">Contract Date</div><div class="value">${escapeHtml(c.contract_date)}</div></div>` : ''}
  ${c.start_date    ? `<div><div class="label">Start Date</div><div class="value">${escapeHtml(c.start_date)}</div></div>` : ''}
  ${c.end_date      ? `<div><div class="label">End Date</div><div class="value">${escapeHtml(c.end_date)}</div></div>` : ''}
  ${proj            ? `<div><div class="label">Project</div><div class="value">${escapeHtml(proj.name)}</div></div>` : ''}
  <div><div class="label">Contract Value</div><div class="value" style="font-weight:600">${formatCurrency(c.value)}</div></div>
</div>
${c.terms ? `
<hr class="divider"/>
<div class="label" style="margin-bottom:10px">Terms &amp; Conditions</div>
<div style="font-size:12px;line-height:1.8;color:#1a1a1a;white-space:pre-line">${escapeHtml(c.terms)}</div>
` : ''}
${docPDFSignatureBlock(
  { label: 'For the Client', name: c.signed_by ?? '' },
  { label: `For ${company.name}`, name: c.prepared_by ?? '' },
)}`;

  const html = buildDocPDF({
    title:       'SERVICE CONTRACT',
    number:      c.con_number,
    status:      c.status,
    statusClass: statusCls,
    company:     { name: company.name, address: company.address, email: company.email },
    body,
    showTin: true,
  });

  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) { toast('Pop-up blocked — please allow pop-ups and try again', 'error'); return; }
  try {
    w.document.write(html);
    w.document.close();
    const user = await getCurrentUser();
    await logDocActivity('contract', id, c.con_number, 'downloaded', user?.name ?? user?.email ?? null);
  } catch (error) {
    console.error('printContract failed:', error);
    w.close();
    toast('Could not generate PDF. Please try again.', 'error');
  }
}
