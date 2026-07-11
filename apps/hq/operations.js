import { formatBytes } from '../../shared/utils/formatUtils.ts';
import { formatDateShort, todayISO } from '../../shared/utils/dateUtils.ts';
import { escapeHtml, docTypeIcon, guessDocType } from '../../shared/utils/helpers.ts';
import { validateRequired } from '../../shared/utils/validators.ts';
import {
  fetchPartners, createPartner, updatePartner, deletePartner, filterPartnersByType,
} from '../../shared/services/partnerService.js';
import {
  fetchDocuments, uploadDocument, getDocumentPublicUrl, saveDocumentMeta,
  getDocumentSignedUrl, removeDocument,
} from '../../shared/services/documentService.js';
import { fetchClients, createClient, findClientByName } from '../../shared/services/clientService.js';
import { createProject } from '../../shared/services/projectService.js';
import { fetchImpactEntries, createImpactEntry, updateImpactEntry, deleteImpactEntry } from '../../shared/services/impactService.js';
import { generateNDAContent, buildNDAWindowContent } from '../../shared/business/ndaGenerator.js';
import { _clients, _partners, _documents, _impactEntries, setClients, setPartners, setDocuments, setImpactEntries } from './state.js';
import { toast, openModal, closeModal } from './ui.js';
import { showPage } from './app.js';

// ── Partners ──────────────────────────────────────────────────────────────────

let _editingPartnerId = null;

export async function loadPartners() {
  setPartners(await fetchPartners());
  renderPartners(_partners);
}

export function renderPartners(list) {
  const grid = document.getElementById('partners-grid');
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

export function filterPartners(type, el) {
  document.querySelectorAll('.partner-filter-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderPartners(filterPartnersByType(_partners, type));
}

function partnerFormHTML(p = {}) {
  const typeOpts = ['School', 'LGU', 'NGO', 'Sponsor', 'Media', 'Startup']
    .map(t => `<option${t === p.type ? ' selected' : ''}>${t}</option>`).join('');
  return `<div class="form-grid">
    <div class="form-group full"><div class="form-label">Organization Name</div><input class="form-input" id="fpr-name" value="${escapeHtml(p.name || '')}" placeholder="e.g. BLISTT Consortium"/></div>
    <div class="form-group"><div class="form-label">Type</div><select class="form-input" id="fpr-type">${typeOpts}</select></div>
    <div class="form-group"><div class="form-label">Contact Person</div><input class="form-input" id="fpr-contact" value="${escapeHtml(p.contact || '')}" placeholder="Full name"/></div>
    <div class="form-group full"><div class="form-label">Email</div><input class="form-input" id="fpr-email" type="email" value="${escapeHtml(p.email || '')}" placeholder="email@org.ph"/></div>
  </div>`;
}

export function openAddPartner() {
  _editingPartnerId = null;
  openModal('Add Partner', partnerFormHTML(), savePartner);
}

export function openEditPartner(id) {
  const p = _partners.find(x => x.id === id);
  if (!p) return;
  _editingPartnerId = id;
  openModal('Edit Partner', partnerFormHTML(p), savePartner);
}

export async function savePartner() {
  const name = document.getElementById('fpr-name').value.trim();
  const err = validateRequired(name, 'Organization name');
  if (err) { toast(err, 'error'); return; }
  const payload = {
    name,
    type:    document.getElementById('fpr-type').value,
    contact: document.getElementById('fpr-contact').value,
    email:   document.getElementById('fpr-email').value,
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

export async function handleDeletePartner(id) {
  if (!confirm('Delete this partner? This cannot be undone.')) return;
  const ok = await deletePartner(id);
  if (!ok) { toast('Could not delete partner', 'error'); return; }
  toast('Partner deleted', '');
  loadPartners();
}

// ── Documents ─────────────────────────────────────────────────────────────────

let _previewDoc = null;

export async function loadDocuments() {
  setDocuments(await fetchDocuments());
  renderDocuments(_documents);
}

export function renderDocuments(docs) {
  document.getElementById('doc-list').innerHTML = docs.length
    ? docs.map(d => `
        <div class="doc-item" style="cursor:pointer" onclick="openDocPreview(${d.id})">
          <div class="doc-icon">${docTypeIcon(d.type)}</div>
          <div style="flex:1">
            <div class="doc-name">${escapeHtml(d.name)}</div>
            <div class="doc-meta">${escapeHtml(d.type || '—')} · ${escapeHtml(d.size || '—')} · ${escapeHtml(d.date || '—')}</div>
          </div>
          <span class="doc-btn">View →</span>
        </div>`).join('')
    : `<div class="empty-state">No documents yet — upload your first file above</div>`;
}

export async function openDocPreview(id) {
  const doc = _documents.find(d => d.id == id);
  if (!doc) return;
  _previewDoc = doc;

  const overlay = document.getElementById('doc-preview-overlay');
  overlay.style.display = 'flex';
  document.getElementById('doc-preview-name').textContent = doc.name;
  document.getElementById('doc-preview-meta').textContent =
    [doc.type, doc.size, doc.date].filter(Boolean).join(' · ');
  document.getElementById('doc-preview-body').innerHTML =
    '<div style="color:var(--ink-3);font-size:12px">Loading preview…</div>';

  const signedUrl = doc.path ? await getDocumentSignedUrl(doc.path) : null;

  const dlBtn = document.getElementById('doc-preview-download');
  if (signedUrl) {
    dlBtn.href = signedUrl;
    dlBtn.style.opacity = '';
    dlBtn.style.pointerEvents = '';
  } else {
    dlBtn.removeAttribute('href');
    dlBtn.style.opacity = '0.4';
    dlBtn.style.pointerEvents = 'none';
  }

  document.getElementById('doc-preview-body').innerHTML = buildPreview(signedUrl, doc.name);
}

function buildPreview(signedUrl, name) {
  if (!signedUrl) {
    return `<div style="text-align:center;padding:40px 24px">
      <div style="font-size:36px;margin-bottom:12px">📄</div>
      <div style="font-size:13px;color:var(--ink-2);margin-bottom:6px">No preview available</div>
      <div style="font-size:11px;color:var(--ink-3)">File path is missing — this entry may have been created manually.</div>
    </div>`;
  }
  const ext = (name || '').split('.').pop().toLowerCase();
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
  document.getElementById('doc-preview-overlay').style.display = 'none';
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

export function handleFileSelect(files) {
  if (!files || !files.length) return;
  const file = files[0];
  document.getElementById('file-input').value = '';
  uploadToStorage(file);
}

export async function uploadToStorage(file) {
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
    });
    if (!saved) {
      toast('File uploaded but metadata could not be saved.', 'error');
      return;
    }
    toast('File uploaded', 'success');
    loadDocuments();
  } catch (err) {
    toast(`Upload error: ${err?.message || 'Unknown error'}`, 'error');
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
  const client = document.getElementById('np-client').value.trim();
  if (!client) { toast('Client name is required', 'error'); return; }
  const address = document.getElementById('np-address').value.trim();
  const purpose = document.getElementById('np-purpose').value.trim() || 'business engagement';
  const dateVal = document.getElementById('np-date').value;
  const contact = document.getElementById('np-contact').value.trim();
  const email   = document.getElementById('np-email').value.trim();
  const brand   = document.getElementById('np-brand').value;

  document.getElementById('np-nda-content').innerHTML =
    generateNDAContent(client, address, contact, email, purpose, dateVal, brand);

  document.getElementById('np-circle-1').className = 'step-circle done';
  document.getElementById('np-circle-1').textContent = '✓';
  document.getElementById('np-label-1').className = 'step-label';
  document.getElementById('np-circle-2').className = 'step-circle active';
  document.getElementById('np-circle-2').textContent = '2';
  document.getElementById('np-label-2').className = 'step-label active';
  document.getElementById('np-step1').style.display = 'none';
  document.getElementById('np-step2').style.display = 'block';
}

export function npGoStep1() {
  document.getElementById('np-step1').style.display = 'block';
  document.getElementById('np-step2').style.display = 'none';
  document.getElementById('np-circle-1').className = 'step-circle active';
  document.getElementById('np-circle-1').textContent = '1';
  document.getElementById('np-label-1').className = 'step-label active';
  document.getElementById('np-circle-2').className = 'step-circle';
  document.getElementById('np-circle-2').textContent = '2';
  document.getElementById('np-label-2').className = 'step-label';
}

export async function npFinish() {
  const client  = document.getElementById('np-client').value.trim();
  const contact = document.getElementById('np-contact').value.trim();
  const email   = document.getElementById('np-email').value.trim();
  const brand   = document.getElementById('np-brand').value;
  const purpose = document.getElementById('np-purpose').value.trim() || 'Project';

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

  document.getElementById('np-circle-2').className = 'step-circle done';
  document.getElementById('np-circle-2').textContent = '✓';
  document.getElementById('np-label-2').className = 'step-label';
  document.getElementById('np-circle-3').className = 'step-circle active';
  document.getElementById('np-circle-3').textContent = '3';
  document.getElementById('np-label-3').className = 'step-label active';

  toast(`Project created for ${client}`, 'success');
  setTimeout(() => showPage('projects'), 1400);
}

export async function downloadNDA() {
  const client  = document.getElementById('np-client').value.trim() || 'Client';
  const address = document.getElementById('np-address').value.trim();
  const purpose = document.getElementById('np-purpose').value.trim() || 'Business Engagement';
  const dateVal = document.getElementById('np-date').value;
  const contact = document.getElementById('np-contact').value.trim();
  const email   = document.getElementById('np-email').value.trim();
  const brand   = document.getElementById('np-brand').value;

  const html = buildNDAWindowContent(client, address, contact, email, purpose, dateVal, brand);
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 400);
}

// ── Impact ────────────────────────────────────────────────────────────────────

export async function loadImpact() {
  setImpactEntries(await fetchImpactEntries());
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

  const el = id => document.getElementById(id);
  el('imp-total-students').textContent = totals.students.toLocaleString();
  el('imp-total-teachers').textContent = totals.teachers.toLocaleString();
  el('imp-total-smes').textContent     = totals.smes.toLocaleString();
  el('imp-total-lgus').textContent     = totals.lgus.toLocaleString();

  el('impact-entries').innerHTML = _impactEntries.length
    ? _impactEntries.map(e => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--ink-4);font-size:12px">
          <div>
            <div style="font-weight:600;color:var(--ink)">${escapeHtml(e.period)} — ${escapeHtml(e.program)}</div>
            <div style="color:var(--ink-3);font-size:10.5px;margin-top:2px">
              ${e.students_reached || 0} students · ${e.teachers_trained || 0} teachers · ${e.smes_supported || 0} SMEs · ${e.lgus_engaged || 0} LGUs
            </div>
          </div>
          <div class="flex-gap" style="gap:4px;flex-shrink:0">
            <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="openEditImpact(${e.id})">Edit</button>
            <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--red)" onclick="handleDeleteImpact(${e.id})">Delete</button>
          </div>
        </div>`).join('')
    : '<div style="color:var(--ink-3);font-size:11.5px;padding:8px 0">No entries yet — log your first entry.</div>';
}

export async function saveImpactEntry() {
  const period  = document.getElementById('imp-period').value.trim();
  const program = document.getElementById('imp-program').value.trim();
  const err = validateRequired(period, 'Period') || validateRequired(program, 'Program');
  if (err) { toast(err, 'error'); return; }
  const result = await createImpactEntry({
    period,
    program,
    students_reached: +document.getElementById('imp-students').value || 0,
    teachers_trained: +document.getElementById('imp-teachers').value || 0,
    smes_supported:   +document.getElementById('imp-smes').value    || 0,
    lgus_engaged:     +document.getElementById('imp-lgus').value    || 0,
  });
  if (!result) return;
  toast('Impact entry saved', 'success');
  ['imp-period', 'imp-program', 'imp-students', 'imp-teachers', 'imp-smes', 'imp-lgus'].forEach(id => {
    document.getElementById(id).value = '';
  });
  loadImpact();
}

export async function handleDeleteImpact(id) {
  if (!confirm('Delete this impact entry? This cannot be undone.')) return;
  const ok = await deleteImpactEntry(id);
  if (!ok) { toast('Could not delete entry', 'error'); return; }
  toast('Entry deleted', '');
  loadImpact();
}

let _editingImpactId = null;

function impactFormHTML(e = {}) {
  return `<div class="form-grid">
    <div class="form-group"><div class="form-label">Period</div><input class="form-input" id="imp-edit-period" value="${escapeHtml(e.period || '')}" placeholder="e.g. Q1 2026"/></div>
    <div class="form-group"><div class="form-label">Program</div><input class="form-input" id="imp-edit-program" value="${escapeHtml(e.program || '')}" placeholder="e.g. MSME Capacity Building"/></div>
    <div class="form-group"><div class="form-label">Students Reached</div><input class="form-input" id="imp-edit-students" type="number" value="${e.students_reached || 0}" min="0"/></div>
    <div class="form-group"><div class="form-label">Teachers Trained</div><input class="form-input" id="imp-edit-teachers" type="number" value="${e.teachers_trained || 0}" min="0"/></div>
    <div class="form-group"><div class="form-label">SMEs Supported</div><input class="form-input" id="imp-edit-smes" type="number" value="${e.smes_supported || 0}" min="0"/></div>
    <div class="form-group"><div class="form-label">LGUs Engaged</div><input class="form-input" id="imp-edit-lgus" type="number" value="${e.lgus_engaged || 0}" min="0"/></div>
  </div>`;
}

export function openEditImpact(id) {
  const e = _impactEntries.find(x => x.id === id);
  if (!e) return;
  _editingImpactId = id;
  openModal('Edit Impact Entry', impactFormHTML(e), saveImpactEdit);
}

async function saveImpactEdit() {
  const period  = document.getElementById('imp-edit-period').value.trim();
  const program = document.getElementById('imp-edit-program').value.trim();
  const err = validateRequired(period, 'Period') || validateRequired(program, 'Program');
  if (err) { toast(err, 'error'); return; }
  const ok = await updateImpactEntry(_editingImpactId, {
    period,
    program,
    students_reached: +document.getElementById('imp-edit-students').value || 0,
    teachers_trained: +document.getElementById('imp-edit-teachers').value || 0,
    smes_supported:   +document.getElementById('imp-edit-smes').value    || 0,
    lgus_engaged:     +document.getElementById('imp-edit-lgus').value    || 0,
  });
  if (!ok) { toast('Could not update entry', 'error'); return; }
  toast('Impact entry updated', 'success');
  _editingImpactId = null;
  closeModal();
  loadImpact();
}
