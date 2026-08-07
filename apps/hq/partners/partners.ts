import { validateRequired } from '@shared/utils/validators.ts';
import {
  fetchPartners, createPartner, updatePartner, deletePartner, filterPartnersByType,
} from './partnerService.ts';
import { fetchProjects } from '@hq/projects/projectService.ts';
import { _projects, _partners, setProjects, setPartners } from '@hq/core/state.ts';
import { toast, openModal, closeModal } from '@hq/core/ui.ts';
import type { Partner } from '@shared/types.ts';
import { partnerGridHTML, partnerFormHTML } from './partners.templates.ts';

const gEl = (id: string) => document.getElementById(id)!;
const gVal = (id: string) => (document.getElementById(id) as HTMLInputElement).value;

let _editingPartnerId: number | null = null;

export async function loadPartners() {
  const [parts, projs] = await Promise.all([fetchPartners(), _projects.length ? _projects : fetchProjects()]);
  setPartners(parts);
  if (!_projects.length) setProjects(projs || []);
  renderPartners(_partners);
}

export function renderPartners(list: Partner[]) {
  gEl('partners-grid').innerHTML = partnerGridHTML(list);
}

export function filterPartners(type: string, el: HTMLElement) {
  document.querySelectorAll('.partner-filter-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderPartners(filterPartnersByType(_partners, type) as Partner[]);
}

export function openAddPartner() {
  _editingPartnerId = null;
  openModal('Add Partner', partnerFormHTML(_projects), savePartner);
}

export function openEditPartner(id: number) {
  const p = _partners.find(x => x.id === id);
  if (!p) return;
  _editingPartnerId = id;
  openModal('Edit Partner', partnerFormHTML(_projects, p), savePartner);
}

export async function savePartner() {
  const name = gVal('fpr-name').trim();
  const err = validateRequired(name, 'Organization name');
  if (err) { toast(err, 'error'); return; }
  const projVal = (document.getElementById('fpr-project') as HTMLInputElement | null)?.value;
  const payload = {
    name,
    type:       gVal('fpr-type'),
    contact:    gVal('fpr-contact'),
    email:      gVal('fpr-email'),
    project_id: projVal ? +projVal : null,
  };
  if (_editingPartnerId) {
    const ok = await updatePartner(_editingPartnerId, payload);
    if (!ok) { toast('Could not update partner', 'error'); return; }
    toast('Partner updated', 'success');
  } else {
    const result = await createPartner(payload);
    if (!result) { toast('Could not add partner. Please try again.', 'error'); return; }
    toast('Partner added', 'success');
  }
  closeModal();
  loadPartners();
}

export async function handleDeletePartner(id: number) {
  if (!confirm('Delete this partner? This cannot be undone.')) return;
  const ok = await deletePartner(id);
  if (!ok) { toast('Could not delete partner', 'error'); return; }
  toast('Partner deleted', '');
  loadPartners();
}
