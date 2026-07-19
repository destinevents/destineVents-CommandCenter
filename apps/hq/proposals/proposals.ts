import { validateRequired } from '@shared/utils/validators.ts';
import {
  fetchProposals, createProposal, updateProposal, deleteProposal, calcWinRate,
} from './proposalService.ts';
import { fetchClients } from '@hq/clients/clientService.ts';
import { _clients, _proposals, setClients, setProposals } from '@hq/core/state.ts';
import { toast, openModal, closeModal } from '@hq/core/ui.ts';
import type { Proposal } from '@shared/types.ts';
import {
  proposalTableHTML, proposalFormHTML, proposalWinRateHTML, proposalValueSummaryHTML,
} from './proposals.templates.ts';

const gEl  = (id: string) => document.getElementById(id)!;
const gVal = (id: string) => (document.getElementById(id) as HTMLInputElement).value;

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
