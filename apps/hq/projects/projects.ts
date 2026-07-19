import { formatCurrency } from '@shared/utils/formatUtils.ts';
import { validateRequired } from '@shared/utils/validators.ts';
import {
  fetchProjects, createProject, updateProject, deleteProject,
} from '@hq/projects/projectService.ts';
import { fetchClients, createClient, findClientByName } from '@hq/clients/clientService.ts';
import { fetchProposals } from '@hq/proposals/proposalService.ts';
import { fetchInvoices } from '@hq/finance/financeService.ts';
import { _clients, _proposals, _projects, setClients, setProjects } from '@hq/core/state.ts';
import { toast, openModal, closeModal } from '@hq/core/ui.ts';
import type { Project, Proposal } from '@shared/types.ts';
import {
  projectTableHTML, projectFormHTML, projectDetailHTML, newClientBannerHTML,
} from './projects.templates.ts';

const gEl  = (id: string) => document.getElementById(id)!;
const gVal = (id: string) => (document.getElementById(id) as HTMLInputElement).value;

let _editingProjectId: number | null = null;

export async function loadProjects() {
  const [projs, clients] = await Promise.all([fetchProjects(), fetchClients()]);
  setProjects(projs);
  setClients(clients || []);
  renderProjects(_projects);
}

export function renderProjects(projects: Project[]) {
  const total = projects.reduce((s, p) => s + (p.value || 0), 0);
  gEl('projects-summary').textContent =
    `${projects.length} project${projects.length !== 1 ? 's' : ''} · ${formatCurrency(total)} total value`;
  gEl('projects-tbody').innerHTML = projectTableHTML(projects);
}

function showProjectError(msg: string) {
  const el = document.getElementById('fp2-error');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('visible');
}

export function openAddProject() {
  _editingProjectId = null;
  openModal('New Project', projectFormHTML(_clients), saveProject);
}

export function openEditProject(id: number) {
  const p = _projects.find(x => x.id === id);
  if (!p) return;
  _editingProjectId = id;
  openModal('Edit Project', projectFormHTML(_clients, p), saveProject);
}

export async function saveProject() {
  const name = gVal('fp2-name').trim();
  const err  = validateRequired(name, 'Project name');
  if (err) { showProjectError(err); return; }
  const payload = {
    name,
    client:   gVal('fp2-client').trim(),
    value:    +gVal('fp2-value') || 0,
    brand:    gVal('fp2-brand'),
    category: gVal('fp2-category'),
    status:   gVal('fp2-status'),
    notes:    gVal('fp2-notes').trim(),
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
  _editingProjectId = null;

  const clientName   = p.client?.trim() ?? '';
  const clientExists = !clientName || !!findClientByName(clientName, _clients);
  const banner       = clientExists ? '' : newClientBannerHTML(clientName);

  openModal(
    'New Project (from Proposal)',
    banner + projectFormHTML(_clients, { name: p.name, client: p.client ?? undefined, value: p.value, status: 'Proposal Approved' }),
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
