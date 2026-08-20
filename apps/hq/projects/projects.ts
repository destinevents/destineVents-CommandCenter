import { formatCurrency } from '@shared/utils/formatUtils.ts';
import { validateRequired } from '@shared/utils/validators.ts';
import { nextDocNumber } from '@shared/services/documents/docNumberService.ts';
import {
  fetchProjects, createProject, updateProject, deleteProject,
} from '@hq/projects/projectService.ts';
import { fetchClients, createClient, findClientByName } from '@hq/clients/clientService.ts';
import { fetchProposals, proposalValue, updateProposal } from '@hq/proposals/proposalService.ts';
import { renderProposals } from '@hq/proposals/proposals.ts';
import { fetchInvoices } from '@hq/finance/financeService.ts';
import { _clients, _proposals, _projects, setClients, setProjects, setProposals } from '@hq/core/state.ts';
import { toast, openModal, closeModal } from '@hq/core/ui.ts';
import type { Invoice, Project } from '@shared/types.ts';
import { completionWarning } from '@shared/projects/projectStatus.ts';
import {
  projectTableHTML, projectFormHTML, projectDetailHTML, newClientBannerHTML,
} from './projects.templates.ts';

const gEl  = (id: string) => document.getElementById(id)!;
const gVal = (id: string) => (document.getElementById(id) as HTMLInputElement).value;

let _editingProjectId: number | null = null;

// Invoices behind the list's OR column. Held here rather than in shared state
// because the Projects page loads independently of Finance.
let _projectInvoices: Invoice[] = [];

// Set only while converting a Won proposal, so the new project records where it
// came from. Cleared by every other way of opening the form, or a later
// unrelated save would inherit the link.
let _convertingProposalId: number | null = null;

export async function loadProjects() {
  // Invoices come along so the list can show each project's OR numbers.
  const [projs, clients, invoices] = await Promise.all([
    fetchProjects(), fetchClients(), fetchInvoices(),
  ]);
  setProjects(projs);
  setClients(clients || []);
  _projectInvoices = invoices || [];
  renderProjects(_projects);
}

export function renderProjects(projects: Project[]) {
  const total = projects.reduce((s, p) => s + (p.value || 0), 0);
  gEl('projects-summary').textContent =
    `${projects.length} project${projects.length !== 1 ? 's' : ''} · ${formatCurrency(total)} total value`;
  gEl('projects-tbody').innerHTML = projectTableHTML(projects, _projectInvoices);
}

function showProjectError(msg: string) {
  const el = document.getElementById('fp2-error');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('visible');
}

export function openAddProject() {
  _editingProjectId = null;
  _convertingProposalId = null;
  openModal('New Project', projectFormHTML(_clients), saveProject);
}

export function openEditProject(id: number) {
  const p = _projects.find(x => x.id === id);
  if (!p) return;
  _editingProjectId = id;
  _convertingProposalId = null;
  openModal('Edit Project', projectFormHTML(_clients, p), saveProject);
}

export async function saveProject() {
  const name = gVal('fp2-name').trim();
  const err  = validateRequired(name, 'Project name');
  if (err) { showProjectError(err); return; }
  // Auto-generate a code (PRJ-YYYY-NNN) when the field is left blank.
  const code = gVal('fp2-code').trim() ||
    nextDocNumber('PRJ', _projects.map(p => p.code ?? ''));
  const payload = {
    name,
    code,
    client:   gVal('fp2-client').trim(),
    value:    +gVal('fp2-value') || 0,
    brand:    gVal('fp2-brand'),
    category: gVal('fp2-category'),
    status:   gVal('fp2-status'),
    notes:    gVal('fp2-notes').trim(),
  };
  if (!confirmCompletion(payload.status)) return;

  if (_editingProjectId) {
    const ok = await updateProject(_editingProjectId, payload);
    if (!ok) { showProjectError('Could not update project. Please try again.'); return; }
    toast('Project updated', 'success');
    await _syncLinkedProposalValue(_editingProjectId, payload.value);
  } else {
    const result = await createProject({
      ...payload,
      // Only set when this came from Proposals -> Project, so the project
      // remembers which quotation won it.
      ...(_convertingProposalId ? { proposal_id: _convertingProposalId } : {}),
      updated_at: new Date().toISOString(),
    });
    if (!result.ok) { showProjectError(result.message || 'Could not save project. Please try again.'); return; }
    toast('Project added', 'success');
  }
  // The conversion happened on the Proposals page, and that row now reads
  // differently — it offers the project rather than a second conversion — so
  // redraw it once the new project is in hand.
  const converted = _convertingProposalId !== null;
  _convertingProposalId = null;
  closeModal();
  await loadProjects();
  if (converted) renderProposals(_proposals);
}

// Completing a project is the one status change that ends something: it leaves
// the Billing Pipeline and does not come back. Outstanding money is counted from
// invoices, not projects, so a job completed before it was receipted stops being
// visible in either place — nothing left anywhere says you are still owed for it.
//
// Not a block. A CSR job, a cancellation, or work settled outside HQ genuinely
// finishes unpaid, and refusing those would only push people to Delete instead.
// One deliberate click for those, a real stop for the one someone forgot to bill.
function confirmCompletion(status: string): boolean {
  if (status !== 'Completed' || !_editingProjectId) return true;

  const project = _projects.find(p => p.id === _editingProjectId);
  if (!project || project.status === 'Completed') return true;

  const warning = completionWarning(project, _projectInvoices);
  if (!warning) return true;

  return confirm(`${warning}\n\nMark “${project.name}” as Completed anyway?`);
}

// The mirror of _syncLinkedProjectValue in proposals.ts: a project and the
// quotation it came from must show the same figure, whichever side was edited.
//
// One exception, and it is deliberate. A quotation built from line items owns
// its total — subtotal plus VAT — so writing a different number straight onto
// it would leave the figure disagreeing with the lines printed beneath it on
// the client's PDF. In that case say so and change nothing, rather than quietly
// producing a document that contradicts itself.
async function _syncLinkedProposalValue(projectId: number, newValue: number): Promise<void> {
  const project = _projects.find(p => p.id === projectId);
  if (!project) return;

  // Projects predating the link column have no proposal_id, so nothing syncs
  // and the save looks like it did nothing. Point at the quotation that is
  // plainly the same job rather than staying quiet.
  if (!project.proposal_id) {
    const orphan = _proposals.find(p => p.name.trim().toLowerCase() === project.name.trim().toLowerCase());
    if (orphan) {
      toast(`Quotation ${orphan.quo_number ?? orphan.name} is not linked to this project, so its value was left alone`, 'error');
    }
    return;
  }

  const proposal = _proposals.find(p => p.id === project.proposal_id);
  if (!proposal || proposal.value === newValue) return;

  if (proposal.total_amount) {
    toast(
      `Quotation ${proposal.quo_number ?? proposal.name} is itemised — edit its line items to change its total`,
      'error',
    );
    return;
  }

  const ok = await updateProposal(proposal.id, { value: newValue });
  if (!ok) { toast('Project saved, but the quotation value could not be updated', 'error'); return; }
  toast(`Quotation “${proposal.name}” updated to ${formatCurrency(newValue)} to match`, 'success');
  setProposals(await fetchProposals());
}

export async function handleDeleteProject(id: number) {
  if (!confirm('Delete this project? This cannot be undone.')) return;
  const ok = await deleteProject(id);
  if (!ok) {
    toast('Cannot delete — project has linked SOBs or invoices. Remove those links first, or ask your admin to run the ON DELETE SET NULL migration.', 'error');
    return;
  }
  toast('Project deleted', '');
  loadProjects();
}

// ── Project detail ────────────────────────────────────────────────────────────

export async function openProjectDetail(id: number) {
  const p = _projects.find(x => x.id === id);
  if (!p) return;
  openModal(p.name, '<div style="padding:16px;text-align:center;color:var(--ink-3);font-size:12px">Loading…</div>', closeModal, 'Close');
  let proposals, invoices;
  try {
    [proposals, invoices] = await Promise.all([fetchProposals(), fetchInvoices()]);
  } catch {
    gEl('modal-body').innerHTML = '<div style="padding:16px;color:var(--red);font-size:12px">Failed to load project data. Please try again.</div>';
    return;
  }
  gEl('modal-body').innerHTML = projectDetailHTML(p, proposals, invoices);
}

// ── Convert proposal → project ────────────────────────────────────────────────

export function convertProposalToProject(proposalId: number) {
  const p = _proposals.find(x => x.id === proposalId);
  if (!p) return;

  // The button stays on a Won quotation forever, so converting twice used to
  // make a second project from the same job — double-counting it in the
  // pipeline and the project list, with nothing to show they were the same.
  const already = _projects.find(x => x.proposal_id === proposalId);
  if (already) {
    toast(`${p.name} is already the project “${already.name}”`, 'error');
    return;
  }

  _editingProjectId = null;
  _convertingProposalId = proposalId;

  const clientName   = p.client?.trim() ?? '';
  const clientExists = !clientName || !!findClientByName(clientName, _clients);
  const banner       = clientExists ? '' : newClientBannerHTML(clientName);

  openModal(
    'New Project (from Proposal)',
    banner + projectFormHTML(_clients, { name: p.name, client: p.client ?? undefined, value: proposalValue(p), status: 'Proposal Approved' }),
    saveProject,
  );
}

export async function addClientFromProposal(name: string) {
  const result = await createClient({ name, total_value: 0 });
  if (!result) { toast('Could not add client', 'error'); return; }
  toast(`${name} added to clients`, 'success');
  document.getElementById('new-client-banner')?.remove();
  const fresh = await fetchClients();
  setClients(fresh);
}
