import { formatCurrency } from '@shared/utils/formatUtils.ts';
import { validateRequired } from '@shared/utils/validators.ts';
import { fetchClients, createClient, updateClient, deleteClient } from './clientService.ts';
import { fetchProposals } from '@hq/proposals/proposalService.ts';
import { fetchProjects } from '@hq/projects/projectService.ts';
import { fetchInvoices } from '@hq/finance/financeService.ts';
import { _clients, _proposals, _projects, _invoices, _sobs, _meetings, setClients } from '@hq/core/state.ts';
import { toast, openModal, closeModal } from '@hq/core/ui.ts';
import type { Client } from '@shared/types.ts';
import { clientTableHTML, clientFormHTML, clientDetailHTML } from './clients.templates.ts';
import { fetchMeetingsByClient, clientMeetingTimelineHTML, getCrmStageLabel } from '@hq/meetings/meetings.ts';

const gEl  = (id: string) => document.getElementById(id)!;
const gVal = (id: string) => (document.getElementById(id) as HTMLInputElement).value;

let _editingClientId: number | null = null;
let _clientStageFilter = '';

const STAGE_FILTERS = [
  'Waiting for Discovery',
  'Waiting for Strategy',
  'Waiting for Kickoff',
  'Active Clients',
  'Completed Clients',
] as const;

function stageFilterMatch(label: string, filter: string): boolean {
  if (filter === 'Completed Clients')   return label === 'Kickoff Completed';
  if (filter === 'Waiting for Kickoff') return label === 'S&P Completed';
  if (filter === 'Waiting for Strategy') return label === 'Discovery Completed';
  if (filter === 'Active Clients')      return label.includes('Scheduled');
  if (filter === 'Waiting for Discovery') return label === 'Waiting for Discovery';
  return true;
}

export function setClientStageFilter(filter: string): void {
  _clientStageFilter = _clientStageFilter === filter ? '' : filter;
  renderClients(_clients);
}

export async function loadClients() {
  setClients(await fetchClients());
  renderClients(_clients);
}

export function renderClients(clients: Client[]) {
  const crmStages: Record<number, string> = {};
  for (const c of clients) {
    const clientMeetings = _meetings.filter(m => m.client_id === c.id);
    crmStages[c.id] = getCrmStageLabel(clientMeetings);
  }

  const filtered = _clientStageFilter
    ? clients.filter(c => stageFilterMatch(crmStages[c.id] ?? 'Waiting for Discovery', _clientStageFilter))
    : clients;

  const total = filtered.reduce((s, c) => s + (c.total_value || 0), 0);
  gEl('clients-summary').textContent =
    `${filtered.length} clients · ${formatCurrency(total)} total value`;

  const filterEl = document.getElementById('clients-stage-filter');
  if (filterEl) {
    filterEl.innerHTML = `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
      ${STAGE_FILTERS.map(f => {
        const active = _clientStageFilter === f;
        return `<button class="btn btn-ghost btn-sm" onclick="setClientStageFilter('${f}')"
          style="${active ? 'background:var(--gold);color:var(--espresso);border-color:var(--gold)' : ''}">${f}</button>`;
      }).join('')}
      ${_clientStageFilter ? `<button class="btn btn-ghost btn-sm" onclick="setClientStageFilter('')">Clear</button>` : ''}
    </div>`;
  }

  gEl('clients-tbody').innerHTML = clientTableHTML(filtered, crmStages);
}

export function openAddClient() {
  _editingClientId = null;
  openModal('Add Client', clientFormHTML(), saveClient);
}

export function openEditClient(id: number) {
  const c = _clients.find(x => x.id === id);
  if (!c) return;
  _editingClientId = id;
  openModal('Edit Client', clientFormHTML(c), saveClient);
}

export async function saveClient() {
  const name = gVal('fc-name').trim();
  const err = validateRequired(name, 'Client name');
  if (err) { toast(err, 'error'); return; }
  const payload = {
    name,
    type:    gVal('fc-type'),
    brand:   gVal('fc-brand'),
    status:  gVal('fc-status'),
    contact: gVal('fc-contact'),
    email:   gVal('fc-email'),
  };
  if (_editingClientId) {
    const ok = await updateClient(_editingClientId, payload);
    if (!ok) { toast('Could not update client', 'error'); return; }
    toast('Client updated', 'success');
  } else {
    const result = await createClient({ ...payload, total_value: 0 });
    if (!result) { toast('Could not add client. Please try again.', 'error'); return; }
    toast('Client added', 'success');
  }
  closeModal();
  loadClients();
}

export async function handleDeleteClient(id: number) {
  const client = _clients.find(c => c.id === id);
  if (!client) return;

  const name = (client.name ?? '').toLowerCase();
  const proposalCount = _proposals.filter(p => (p.client ?? '').toLowerCase() === name).length;
  const projectCount  = _projects.filter(p  => (p.client ?? '').toLowerCase() === name).length;
  const invoiceCount  = _invoices.filter(i  => (i.client ?? '').toLowerCase() === name).length;
  const sobCount      = _sobs.filter(s      => (s.client ?? '').toLowerCase() === name).length;
  const total = proposalCount + projectCount + invoiceCount + sobCount;

  const linkedNote = total > 0
    ? ` They have ${[
        proposalCount > 0 && `${proposalCount} proposal${proposalCount !== 1 ? 's' : ''}`,
        projectCount  > 0 && `${projectCount} project${projectCount !== 1 ? 's' : ''}`,
        invoiceCount  > 0 && `${invoiceCount} invoice${invoiceCount !== 1 ? 's' : ''}`,
        sobCount      > 0 && `${sobCount} SOB${sobCount !== 1 ? 's' : ''}`,
      ].filter(Boolean).join(', ')} linked to their name — those records will not be deleted.`
    : '';

  if (!confirm(`Delete ${client.name}?${linkedNote} This cannot be undone.`)) return;
  const ok = await deleteClient(id);
  if (!ok) { toast('Could not delete client', 'error'); return; }
  toast('Client deleted', '');
  loadClients();
}

export async function openClientDetail(id: number) {
  const c = _clients.find(x => x.id === id);
  if (!c) return;
  openModal(c.name, '<div style="padding:16px;text-align:center;color:var(--ink-3);font-size:12px">Loading…</div>', closeModal, 'Close');
  let proposals, projects, invoices, meetings;
  try {
    [proposals, projects, invoices, meetings] = await Promise.all([
      fetchProposals(), fetchProjects(), fetchInvoices(), fetchMeetingsByClient(id),
    ]);
  } catch {
    gEl('modal-body').innerHTML = '<div style="padding:16px;color:var(--red);font-size:12px">Failed to load client data. Please try again.</div>';
    return;
  }
  const meetingsHTML = clientMeetingTimelineHTML(meetings ?? []);
  gEl('modal-body').innerHTML = clientDetailHTML(c, proposals, projects, invoices) + `
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--ink-5)">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);margin-bottom:10px">Meeting Pipeline</div>
      ${meetingsHTML}
    </div>`;
}
