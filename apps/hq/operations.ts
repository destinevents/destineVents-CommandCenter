import { formatBytes } from '../../shared/utils/formatUtils.ts';
import { formatDateShort, todayISO } from '../../shared/utils/dateUtils.ts';
import { escapeHtml, docTypeIcon, guessDocType } from '../../shared/utils/helpers.ts';
import { validateRequired } from '../../shared/utils/validators.ts';
import {
  fetchPartners, createPartner, updatePartner, deletePartner, filterPartnersByType,
} from '../../shared/services/partnerService.ts';
import {
  fetchDocuments, uploadDocument, getDocumentPublicUrl, saveDocumentMeta,
  getDocumentSignedUrl, removeDocument,
} from '../../shared/services/documentService.ts';
import { fetchClients, createClient, findClientByName } from '../../shared/services/clientService.ts';
import { fetchProjects, createProject } from '../../shared/services/projectService.ts';
import { fetchImpactEntries, createImpactEntry, updateImpactEntry, deleteImpactEntry } from '../../shared/services/impactService.ts';
import { generateNDAContent, buildNDAWindowContent } from '../../shared/business/ndaGenerator.js';
import { _clients, _projects, _partners, _documents, _impactEntries, setClients, setProjects, setPartners, setDocuments, setImpactEntries } from './state.ts';
import { toast, openModal, closeModal } from './ui.ts';
import { showPage } from './app.ts';
import type { Partner, Document as HQDocument, ImpactEntry } from '../../shared/types.ts';

const gEl = (id: string) => document.getElementById(id)!;
const gVal = (id: string) => (document.getElementById(id) as HTMLInputElement).value;

// ── Partners ──────────────────────────────────────────────────────────────────

let _editingPartnerId: number | null = null;

export async function loadPartners() {
  const [parts, projs] = await Promise.all([fetchPartners(), _projects.length ? _projects : fetchProjects()]);
  setPartners(parts);
  if (!_projects.length) setProjects(projs || []);
  renderPartners(_partners);
}

export function renderPartners(list: Partner[]) {
  const grid = gEl('partners-grid');
  grid.innerHTML = list.length
    ? list.map(p => `
        <div class="partner-card">
          <div class="partner-type-tag">${escapeHtml(p.type)}</div>
          <div class="partner-name">${escapeHtml(p.name)}</div>
          <div class="partner-contact">${escapeHtml(p.contact) || ''}<br>${escapeHtml(p.email) || ''}</div>
          <div class="flex-gap" style="gap:4px;margin-top:10px">
            <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;flex:1" onclick="openEditPartner(${p.id})">Edit</button>
            <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--red)" onclick="handleDeletePartner(${p.id})">Delete</button>
          </div>
        </div>`).join('')
    : `<div style="grid-column:1/-1"><div class="empty-state">No partners in this category</div></div>`;
}

export function filterPartners(type: string, el: HTMLElement) {
  document.querySelectorAll('.partner-filter-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderPartners(filterPartnersByType(_partners, type) as Partner[]);
}

function partnerFormHTML(p: Partial<Partner> = {}) {
  const typeOpts    = ['School', 'LGU', 'NGO', 'Sponsor', 'Media', 'Startup']
    .map(t => `<option${t === p.type ? ' selected' : ''}>${t}</option>`).join('');
  const projectOpts = `<option value="">— no project —</option>` + _projects.map(pr => `<option value="${pr.id}"${p.project_id === pr.id ? ' selected' : ''}>${escapeHtml(pr.name)}</option>`).join('');
  return `<div class="form-grid">
    <div class="form-group full"><div class="form-label">Organization Name</div><input class="form-input" id="fpr-name" value="${escapeHtml(p.name || '')}" placeholder="e.g. BLISTT Consortium"/></div>
    <div class="form-group"><div class="form-label">Type</div><select class="form-input" id="fpr-type">${typeOpts}</select></div>
    <div class="form-group"><div class="form-label">Contact Person</div><input class="form-input" id="fpr-contact" value="${escapeHtml(p.contact || '')}" placeholder="Full name"/></div>
    <div class="form-group full"><div class="form-label">Email</div><input class="form-input" id="fpr-email" type="email" value="${escapeHtml(p.email || '')}" placeholder="email@org.ph"/></div>
    <div class="form-group full"><div class="form-label">Project (optional)</div><select class="form-input" id="fpr-project">${projectOpts}</select></div>
  </div>`;
}

export function openAddPartner() {
  _editingPartnerId = null;
  openModal('Add Partner', partnerFormHTML(), savePartner);
}

export function openEditPartner(id: number) {
  const p = _partners.find(x => x.id === id);
  if (!p) return;
  _editingPartnerId = id;
  openModal('Edit Partner', partnerFormHTML(p), savePartner);
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
    if (!result) return;
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

// ── Documents ─────────────────────────────────────────────────────────────────

let _previewDoc: HQDocument | null = null;

export async function loadDocuments() {
  setDocuments(await fetchDocuments());
  renderDocuments(_documents);
}

export function renderDocuments(docs: HQDocument[]) {
  gEl('doc-list').innerHTML = docs.length
    ? docs.map(d => `
        <div class="doc-item" style="cursor:pointer" onclick="openDocPreview(${d.id})">
          <div class="doc-icon">${docTypeIcon(d.type ?? '')}</div>
          <div style="flex:1">
            <div class="doc-name">${escapeHtml(d.name)}</div>
            <div class="doc-meta">${escapeHtml(d.type || '—')} · ${escapeHtml(d.size || '—')} · ${escapeHtml(d.date || '—')}</div>
          </div>
          <span class="doc-btn">View →</span>
        </div>`).join('')
    : `<div class="empty-state">No documents yet — upload your first file above</div>`;
}

export async function openDocPreview(id: number) {
  const doc = _documents.find(d => d.id === id);
  if (!doc) return;
  _previewDoc = doc;

  const overlay = gEl('doc-preview-overlay') as HTMLElement;
  overlay.style.display = 'flex';
  gEl('doc-preview-name').textContent = doc.name;
  gEl('doc-preview-meta').textContent =
    [doc.type, doc.size, doc.date].filter(Boolean).join(' · ');
  gEl('doc-preview-body').innerHTML =
    '<div style="color:var(--ink-3);font-size:12px">Loading preview…</div>';

  const signedUrl = doc.path ? await getDocumentSignedUrl(doc.path) : null;

  const dlBtn = gEl('doc-preview-download') as HTMLAnchorElement;
  if (signedUrl) {
    dlBtn.href = signedUrl;
    dlBtn.style.opacity = '';
    dlBtn.style.pointerEvents = '';
  } else {
    dlBtn.removeAttribute('href');
    dlBtn.style.opacity = '0.4';
    dlBtn.style.pointerEvents = 'none';
  }

  gEl('doc-preview-body').innerHTML = buildPreview(signedUrl, doc.name);
}

function buildPreview(signedUrl: string | null, name: string) {
  if (!signedUrl) {
    return `<div style="text-align:center;padding:40px 24px">
      <div style="font-size:36px;margin-bottom:12px">📄</div>
      <div style="font-size:13px;color:var(--ink-2);margin-bottom:6px">No preview available</div>
      <div style="font-size:11px;color:var(--ink-3)">File path is missing — this entry may have been created manually.</div>
    </div>`;
  }
  const ext = (name || '').split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') {
    return `<iframe src="${signedUrl}" style="width:100%;height:100%;min-height:500px;border:none;display:block"></iframe>`;
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
    return `<img src="${signedUrl}" alt="${escapeHtml(name)}" style="max-width:100%;max-height:70vh;object-fit:contain;display:block;margin:auto;padding:20px">`;
  }
  return `<div style="text-align:center;padding:40px 24px">
    <div style="font-size:36px;margin-bottom:12px">📄</div>
    <div style="font-size:13px;color:var(--ink-2);margin-bottom:6px">${escapeHtml(name)}</div>
    <div style="font-size:11px;color:var(--ink-3)">Use the Download button to open this file.</div>
  </div>`;
}

export function closeDocPreview() {
  (gEl('doc-preview-overlay') as HTMLElement).style.display = 'none';
  _previewDoc = null;
}

export async function handleDeleteDocument() {
  if (!_previewDoc) return;
  if (!confirm(`Delete "${_previewDoc.name}"? This removes the file permanently.`)) return;
  const ok = await removeDocument(_previewDoc.id, _previewDoc.path);
  if (!ok) { toast('Could not delete document', 'error'); return; }
  toast('Document deleted', '');
  closeDocPreview();
  loadDocuments();
}

export function handleFileSelect(files: FileList) {
  if (!files || !files.length) return;
  const file = files[0];
  (gEl('file-input') as HTMLInputElement).value = '';
  const clientOpts  = `<option value="">— no client —</option>` + _clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  const projectOpts = `<option value="">— no project —</option>` + _projects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  openModal('Tag Document', `<div style="font-size:12px;color:var(--ink-2);margin-bottom:12px">Uploading: <strong>${escapeHtml(file.name)}</strong></div>
  <div class="form-grid">
    <div class="form-group full"><div class="form-label">Client (optional)</div><select class="form-input" id="doc-ctx-client">${clientOpts}</select></div>
    <div class="form-group full"><div class="form-label">Project (optional)</div><select class="form-input" id="doc-ctx-project">${projectOpts}</select></div>
  </div>`, () => {
    const clientVal  = (document.getElementById('doc-ctx-client') as HTMLInputElement | null)?.value;
    const projectVal = (document.getElementById('doc-ctx-project') as HTMLInputElement | null)?.value;
    closeModal();
    uploadToStorage(file, clientVal ? +clientVal : null, projectVal ? +projectVal : null);
  });
}

export async function uploadToStorage(file: File, clientId: number | null = null, projectId: number | null = null) {
  toast('Uploading…');
  try {
    const path = `${Date.now()}-${file.name}`;
    const uploadResult = await uploadDocument(file, path);
    if (!uploadResult) {
      toast('Upload failed — check that the "documents" storage bucket exists in Supabase.', 'error');
      return;
    }
    const url = getDocumentPublicUrl(path);
    const saved = await saveDocumentMeta({
      name: file.name, type: guessDocType(file.name),
      size: formatBytes(file.size),
      date: todayISO(),
      url, path,
      client_id:  clientId  || null,
      project_id: projectId || null,
    });
    if (!saved) {
      toast('File uploaded but metadata could not be saved.', 'error');
      return;
    }
    toast('File uploaded', 'success');
    loadDocuments();
  } catch (err) {
    toast(`Upload error: ${(err as Error)?.message || 'Unknown error'}`, 'error');
  }
}

// ── NDA / New Project flow ────────────────────────────────────────────────────

export async function loadNDA() {
  const clients = _clients.length ? _clients : await fetchClients();
  if (!_clients.length) setClients(clients || []);
  const dl = document.getElementById('np-client-list');
  if (dl) dl.innerHTML = (clients || []).map(c => `<option value="${escapeHtml(c.name)}"/>`).join('');
}

export function npGoStep2() {
  const client = (gEl('np-client') as HTMLInputElement).value.trim();
  if (!client) { toast('Client name is required', 'error'); return; }
  const address = (gEl('np-address') as HTMLInputElement).value.trim();
  const purpose = (gEl('np-purpose') as HTMLInputElement).value.trim() || 'business engagement';
  const dateVal = (gEl('np-date') as HTMLInputElement).value;
  const contact = (gEl('np-contact') as HTMLInputElement).value.trim();
  const email   = (gEl('np-email') as HTMLInputElement).value.trim();
  const brand   = (gEl('np-brand') as HTMLInputElement).value;

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
  const brand   = (gEl('np-brand') as HTMLInputElement).value;

  const html = buildNDAWindowContent(client, address, contact, email, purpose, dateVal);
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 400);
}

// ── Impact ────────────────────────────────────────────────────────────────────

export async function loadImpact() {
  const [entries, projs] = await Promise.all([fetchImpactEntries(), _projects.length ? _projects : fetchProjects()]);
  setImpactEntries(entries);
  if (!_projects.length) setProjects(projs || []);
  const sel = document.getElementById('imp-project');
  if (sel) {
    sel.innerHTML = `<option value="">— no project —</option>` + _projects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  }
  renderImpact();
}

export function renderImpact() {
  const totals = { students: 0, teachers: 0, smes: 0, lgus: 0 };
  _impactEntries.forEach(e => {
    totals.students += e.students_reached || 0;
    totals.teachers += e.teachers_trained || 0;
    totals.smes     += e.smes_supported   || 0;
    totals.lgus     += e.lgus_engaged     || 0;
  });

  const el = (id: string) => document.getElementById(id)!;
  el('imp-total-students').textContent = totals.students.toLocaleString();
  el('imp-total-teachers').textContent = totals.teachers.toLocaleString();
  el('imp-total-smes').textContent     = totals.smes.toLocaleString();
  el('imp-total-lgus').textContent     = totals.lgus.toLocaleString();

  el('impact-entries').innerHTML = _impactEntries.length
    ? _impactEntries.map(e => {
        const proj = e.project_id ? _projects.find(p => p.id === e.project_id) : null;
        return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--ink-4);font-size:12px">
          <div>
            <div style="font-weight:600;color:var(--ink)">${escapeHtml(e.period)} — ${escapeHtml(e.program)}</div>
            <div style="color:var(--ink-3);font-size:10.5px;margin-top:2px">
              ${e.students_reached || 0} students · ${e.teachers_trained || 0} teachers · ${e.smes_supported || 0} SMEs · ${e.lgus_engaged || 0} LGUs${proj ? ` · <span style="color:var(--blue)">${escapeHtml(proj.name)}</span>` : ''}
            </div>
          </div>
          <div class="flex-gap" style="gap:4px;flex-shrink:0">
            <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="openEditImpact(${e.id})">Edit</button>
            <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--red)" onclick="handleDeleteImpact(${e.id})">Delete</button>
          </div>
        </div>`;
      }).join('')
    : '<div style="color:var(--ink-3);font-size:11.5px;padding:8px 0">No entries yet — log your first entry.</div>';
}

export async function saveImpactEntry() {
  const period  = gVal('imp-period').trim();
  const program = gVal('imp-program').trim();
  const err = validateRequired(period, 'Period') || validateRequired(program, 'Program');
  if (err) { toast(err, 'error'); return; }
  const projVal = (document.getElementById('imp-project') as HTMLInputElement | null)?.value;
  const result = await createImpactEntry({
    period,
    program,
    students_reached: +gVal('imp-students') || 0,
    teachers_trained: +gVal('imp-teachers') || 0,
    smes_supported:   +gVal('imp-smes')     || 0,
    lgus_engaged:     +gVal('imp-lgus')     || 0,
    project_id:       projVal ? +projVal : null,
  });
  if (!result) return;
  toast('Impact entry saved', 'success');
  ['imp-period', 'imp-program', 'imp-students', 'imp-teachers', 'imp-smes', 'imp-lgus'].forEach(id => {
    (document.getElementById(id) as HTMLInputElement).value = '';
  });
  const projSel = document.getElementById('imp-project') as HTMLInputElement | null;
  if (projSel) projSel.value = '';
  loadImpact();
}

export async function handleDeleteImpact(id: number) {
  if (!confirm('Delete this impact entry? This cannot be undone.')) return;
  const ok = await deleteImpactEntry(id);
  if (!ok) { toast('Could not delete entry', 'error'); return; }
  toast('Entry deleted', '');
  loadImpact();
}

let _editingImpactId: number | null = null;

function impactFormHTML(e: Partial<ImpactEntry> = {}) {
  const projectOpts = `<option value="">— no project —</option>` + _projects.map(p => `<option value="${p.id}"${e.project_id === p.id ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
  return `<div class="form-grid">
    <div class="form-group"><div class="form-label">Period</div><input class="form-input" id="imp-edit-period" value="${escapeHtml(e.period || '')}" placeholder="e.g. Q1 2026"/></div>
    <div class="form-group"><div class="form-label">Program</div><input class="form-input" id="imp-edit-program" value="${escapeHtml(e.program || '')}" placeholder="e.g. MSME Capacity Building"/></div>
    <div class="form-group"><div class="form-label">Students Reached</div><input class="form-input" id="imp-edit-students" type="number" value="${e.students_reached || 0}" min="0"/></div>
    <div class="form-group"><div class="form-label">Teachers Trained</div><input class="form-input" id="imp-edit-teachers" type="number" value="${e.teachers_trained || 0}" min="0"/></div>
    <div class="form-group"><div class="form-label">SMEs Supported</div><input class="form-input" id="imp-edit-smes" type="number" value="${e.smes_supported || 0}" min="0"/></div>
    <div class="form-group"><div class="form-label">LGUs Engaged</div><input class="form-input" id="imp-edit-lgus" type="number" value="${e.lgus_engaged || 0}" min="0"/></div>
    <div class="form-group full"><div class="form-label">Project (optional)</div><select class="form-input" id="imp-edit-project">${projectOpts}</select></div>
  </div>`;
}

export function openEditImpact(id: number) {
  const e = _impactEntries.find(x => x.id === id);
  if (!e) return;
  _editingImpactId = id;
  openModal('Edit Impact Entry', impactFormHTML(e), saveImpactEdit);
}

async function saveImpactEdit() {
  if (!_editingImpactId) return;
  const period  = gVal('imp-edit-period').trim();
  const program = gVal('imp-edit-program').trim();
  const err = validateRequired(period, 'Period') || validateRequired(program, 'Program');
  if (err) { toast(err, 'error'); return; }
  const editProjVal = (document.getElementById('imp-edit-project') as HTMLInputElement | null)?.value;
  const ok = await updateImpactEntry(_editingImpactId, {
    period,
    program,
    students_reached: +gVal('imp-edit-students') || 0,
    teachers_trained: +gVal('imp-edit-teachers') || 0,
    smes_supported:   +gVal('imp-edit-smes')     || 0,
    lgus_engaged:     +gVal('imp-edit-lgus')     || 0,
    project_id:       editProjVal ? +editProjVal : null,
  });
  if (!ok) { toast('Could not update entry', 'error'); return; }
  toast('Impact entry updated', 'success');
  _editingImpactId = null;
  closeModal();
  loadImpact();
}
