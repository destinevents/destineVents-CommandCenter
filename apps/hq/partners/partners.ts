import { validateRequired } from '@shared/utils/validators.ts';
import {
  fetchPartners, createPartner, updatePartner, deletePartner, filterPartnersByType,
} from './partnerService.ts';
import { fetchClients, createClient, findClientByName } from '@hq/clients/clientService.ts';
import { fetchProjects, createProject } from '@hq/projects/projectService.ts';
import { generateNDAContent, buildNDAWindowContent } from './ndaGenerator.ts';
import { _clients, _projects, _partners, setClients, setProjects, setPartners } from '@hq/core/state.ts';
import { toast, openModal, closeModal } from '@hq/core/ui.ts';
import { showPage } from '@hq/core/app.ts';
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

// ── NDA / New Project flow ────────────────────────────────────────────────────

export async function loadNDA() {
  const clients = _clients.length ? _clients : await fetchClients();
  if (!_clients.length) setClients(clients || []);
  const dl = document.getElementById('np-client-list');
  if (dl) dl.innerHTML = (clients || []).map(c => `<option value="${c.name}"/>`).join('');
}

export function npGoStep2() {
  const client  = (gEl('np-client') as HTMLInputElement).value.trim();
  if (!client) { toast('Client name is required', 'error'); return; }
  const address = (gEl('np-address') as HTMLInputElement).value.trim();
  const purpose = (gEl('np-purpose') as HTMLInputElement).value.trim() || 'business engagement';
  const dateVal = (gEl('np-date') as HTMLInputElement).value;
  const contact = (gEl('np-contact') as HTMLInputElement).value.trim();
  const email   = (gEl('np-email') as HTMLInputElement).value.trim();

  gEl('np-nda-content').innerHTML =
    generateNDAContent(client, address, contact, email, purpose, dateVal);

  gEl('np-circle-1').className = 'step-circle done';
  gEl('np-circle-1').textContent = '✓';
  gEl('np-label-1').className = 'step-label';
  gEl('np-circle-2').className = 'step-circle active';
  gEl('np-circle-2').textContent = '2';
  gEl('np-label-2').className = 'step-label active';
  (gEl('np-step1') as HTMLElement).style.display = 'none';
  (gEl('np-step2') as HTMLElement).style.display = 'block';
}

export function npGoStep1() {
  (gEl('np-step1') as HTMLElement).style.display = 'block';
  (gEl('np-step2') as HTMLElement).style.display = 'none';
  gEl('np-circle-1').className = 'step-circle active';
  gEl('np-circle-1').textContent = '1';
  gEl('np-label-1').className = 'step-label active';
  gEl('np-circle-2').className = 'step-circle';
  gEl('np-circle-2').textContent = '2';
  gEl('np-label-2').className = 'step-label';
}

export async function npFinish() {
  const client  = (gEl('np-client') as HTMLInputElement).value.trim();
  const contact = (gEl('np-contact') as HTMLInputElement).value.trim();
  const email   = (gEl('np-email') as HTMLInputElement).value.trim();
  const brand   = (gEl('np-brand') as HTMLInputElement).value;
  const purpose = (gEl('np-purpose') as HTMLInputElement).value.trim() || 'Project';

  const freshClients = await fetchClients();
  const exists = findClientByName(client, freshClients);
  if (!exists) {
    await createClient({
      name: client, type: 'Corporate', brand, contact, email,
      total_value: 0, status: 'NDA Signed',
    });
  }

  await createProject({
    name: purpose,
    client,
    brand,
    category: 'Events',
    value: 0,
    status: 'NDA Signed',
    notes: `Created via New Project flow. Contact: ${contact} <${email}>`,
    updated_at: new Date().toISOString(),
  });

  gEl('np-circle-2').className = 'step-circle done';
  gEl('np-circle-2').textContent = '✓';
  gEl('np-label-2').className = 'step-label';
  gEl('np-circle-3').className = 'step-circle active';
  gEl('np-circle-3').textContent = '3';
  gEl('np-label-3').className = 'step-label active';

  toast(`Project created for ${client}`, 'success');
  setTimeout(() => showPage('projects'), 1400);
}

export async function downloadNDA() {
  const client  = (gEl('np-client') as HTMLInputElement).value.trim() || 'Client';
  const address = (gEl('np-address') as HTMLInputElement).value.trim();
  const purpose = (gEl('np-purpose') as HTMLInputElement).value.trim() || 'Business Engagement';
  const dateVal = (gEl('np-date') as HTMLInputElement).value;
  const contact = (gEl('np-contact') as HTMLInputElement).value.trim();
  const email   = (gEl('np-email') as HTMLInputElement).value.trim();

  const html = buildNDAWindowContent(client, address, contact, email, purpose, dateVal);
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 400);
}
