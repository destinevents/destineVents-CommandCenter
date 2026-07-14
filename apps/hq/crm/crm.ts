import { formatCurrency } from '@shared/utils/formatUtils.ts';
import { validateRequired } from '@shared/utils/validators.ts';
import {
  fetchClients, createClient, updateClient, deleteClient,
} from '@shared/services/crm/clientService.ts';
import {
  fetchProposals, createProposal, updateProposal, deleteProposal, calcWinRate,
} from '@shared/services/crm/proposalService.ts';
import { fetchProjects } from '@shared/services/projects/projectService.ts';
import { fetchInvoices } from '@shared/services/finance/financeService.ts';
import { _clients, _proposals, _projects, _invoices, _sobs, setClients, setProposals } from '@hq/state.ts';
import { toast, openModal, closeModal } from '@hq/ui.ts';
import type { Client, Proposal } from '@shared/types.ts';
import {
  clientTableHTML, clientFormHTML, clientDetailHTML,
  proposalTableHTML, proposalFormHTML, proposalWinRateHTML, proposalValueSummaryHTML,
} from './crm.templates.ts';

const gEl  = (id: string) => document.getElementById(id)!;
const gVal = (id: string) => (document.getElementById(id) as HTMLInputElement).value;

// ── Clients ───────────────────────────────────────────────────────────────────

let _editingClientId: number | null = null;

export async function loadClients() {
  setClients(await fetchClients());
  renderClients(_clients);
}

export function renderClients(clients: Client[]) {
  const total = clients.reduce((s, c) => s + (c.total_value || 0), 0);
  gEl('clients-summary').textContent =
    `${clients.length} clients · ${formatCurrency(total)} total value`;
  gEl('clients-tbody').innerHTML = clientTableHTML(clients);
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

// ── Proposals ─────────────────────────────────────────────────────────────────

let _editingProposalId: number | null = null;

export async function loadProposals() {
  const [proposals, clients] = await Promise.all([fetchProposals(), fetchClients()]);
  setProposals(proposals);
  setClients(clients || []);
  renderProposals(_proposals);
}

export function renderProposals(proposals: Proposal[]) {
  const stats = calcWinRate(proposals);
  gEl('win-rate-pct').textContent = stats.winRate + '%';
  gEl('win-rate-breakdown').innerHTML    = proposalWinRateHTML(stats);
  gEl('proposals-value-summary').innerHTML = proposalValueSummaryHTML(stats);
  gEl('proposals-summary').textContent  = `${stats.total} proposals`;
  gEl('proposals-tbody').innerHTML      = proposalTableHTML(proposals);
}

export function openAddProposal() {
  _editingProposalId = null;
  openModal('New Proposal', proposalFormHTML(_clients), saveProposal);
}

export function openEditProposal(id: number) {
  const p = _proposals.find(x => x.id === id);
  if (!p) return;
  _editingProposalId = id;
  openModal('Edit Proposal', proposalFormHTML(_clients, p), saveProposal);
}

export async function saveProposal() {
  const name = gVal('fp-name').trim();
  const err = validateRequired(name, 'Proposal name');
  if (err) { toast(err, 'error'); return; }
  const payload = {
    name,
    client:   gVal('fp-client'),
    value:    +gVal('fp-value') || 0,
    sent:     gVal('fp-sent') || null,
    followup: gVal('fp-followup') || null,
    status:   gVal('fp-status'),
  };
  if (_editingProposalId) {
    const ok = await updateProposal(_editingProposalId, payload);
    if (!ok) { toast('Could not update proposal', 'error'); return; }
    toast('Proposal updated', 'success');
  } else {
    const result = await createProposal(payload);
    if (!result) { toast('Could not add proposal. Please try again.', 'error'); return; }
    toast('Proposal added', 'success');
  }
  closeModal();
  loadProposals();
}

export async function handleDeleteProposal(id: number) {
  if (!confirm('Delete this proposal? This cannot be undone.')) return;
  const ok = await deleteProposal(id);
  if (!ok) { toast('Could not delete proposal', 'error'); return; }
  toast('Proposal deleted', '');
  loadProposals();
}

// ── Client detail ─────────────────────────────────────────────────────────────

export async function openClientDetail(id: number) {
  const c = _clients.find(x => x.id === id);
  if (!c) return;
  openModal(c.name, '<div style="padding:16px;text-align:center;color:var(--ink-3);font-size:12px">Loading…</div>', closeModal, 'Close');
  let proposals, projects, invoices;
  try {
    [proposals, projects, invoices] = await Promise.all([
      fetchProposals(), fetchProjects(), fetchInvoices(),
    ]);
  } catch {
    gEl('modal-body').innerHTML = '<div style="padding:16px;color:var(--red);font-size:12px">Failed to load client data. Please try again.</div>';
    return;
  }
  gEl('modal-body').innerHTML = clientDetailHTML(c, proposals, projects, invoices);
}
