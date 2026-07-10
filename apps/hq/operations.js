import { formatBytes } from '../../shared/utils/formatUtils.ts';
import { formatDateShort, todayISO } from '../../shared/utils/dateUtils.ts';
import { escapeHtml, docTypeIcon, guessDocType } from '../../shared/utils/helpers.ts';
import { validateRequired } from '../../shared/utils/validators.ts';
import { fetchPartners, createPartner, filterPartnersByType } from '../../shared/services/partnerService.js';
import { fetchDocuments, uploadDocument, getDocumentPublicUrl, saveDocumentMeta } from '../../shared/services/documentService.js';
import { createClient, findClientByName } from '../../shared/services/clientService.js';
import { createProject } from '../../shared/services/projectService.js';
import { fetchImpactEntries, createImpactEntry } from '../../shared/services/impactService.js';
import { generateNDAContent, buildNDAWindowContent } from '../../shared/business/ndaGenerator.js';
import { _clients, _partners, _documents, _impactEntries, setPartners, setDocuments, setImpactEntries } from './state.js';
import { toast, openModal, closeModal } from './ui.js';
import { showPage } from './app.js';

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
          <div class="partner-contact">${escapeHtml(p.contact)||''}<br>${escapeHtml(p.email)||''}</div>
        </div>`).join('')
    : `<div style="grid-column:1/-1"><div class="empty-state">No partners in this category</div></div>`;
}

export function filterPartners(type, el) {
  document.querySelectorAll('.partner-filter-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderPartners(filterPartnersByType(_partners, type));
}

export function openAddPartner() {
  openModal('Add Partner', `
    <div class="form-grid">
      <div class="form-group full"><div class="form-label">Organization Name</div><input class="form-input" id="fpr-name" placeholder="e.g. BLISTT Consortium"/></div>
      <div class="form-group"><div class="form-label">Type</div>
        <select class="form-input" id="fpr-type"><option>School</option><option>LGU</option><option>NGO</option><option>Sponsor</option><option>Media</option><option>Startup</option></select>
      </div>
      <div class="form-group"><div class="form-label">Contact Person</div><input class="form-input" id="fpr-contact" placeholder="Full name"/></div>
      <div class="form-group full"><div class="form-label">Email</div><input class="form-input" id="fpr-email" type="email" placeholder="email@org.ph"/></div>
    </div>`, savePartner);
}

export async function savePartner() {
  const name = document.getElementById('fpr-name').value.trim();
  const err = validateRequired(name, 'Organization name');
  if (err) { toast(err, 'error'); return; }
  const result = await createPartner({
    name,
    type:    document.getElementById('fpr-type').value,
    contact: document.getElementById('fpr-contact').value,
    email:   document.getElementById('fpr-email').value,
  });
  if (!result) return;
  toast('Partner added', 'success');
  closeModal(); loadPartners();
}

export async function loadDocuments() {
  setDocuments(await fetchDocuments());
  renderDocuments(_documents);
}

export function renderDocuments(docs) {
  document.getElementById('doc-list').innerHTML = docs.length
    ? docs.map(d => `
        <div class="doc-item">
          <div class="doc-icon">${docTypeIcon(d.type)}</div>
          <div>
            <div class="doc-name">${escapeHtml(d.name)}</div>
            <div class="doc-meta">${escapeHtml(d.type)} \u00B7 ${escapeHtml(d.size)} \u00B7 ${escapeHtml(d.date)}</div>
          </div>
          <div class="doc-actions">
            <button class="doc-btn" onclick="toast('Connect Supabase Storage to enable real file downloads','')">Download</button>
          </div>
        </div>`).join('')
    : `<div class="empty-state">No documents yet \u2014 upload your first file above</div>`;
}

export function handleFileSelect(files) {
  if (!files || !files.length) return;
  document.getElementById('file-input').value = '';
  uploadToStorage(files[0]);
}

export async function uploadToStorage(file) {
  toast('Uploading\u2026');
  const path = `${Date.now()}-${file.name}`;
  const uploadResult = await uploadDocument(file, path);
  if (!uploadResult) return;
  const url = getDocumentPublicUrl(path);
  await saveDocumentMeta({
    name: file.name, type: guessDocType(file.name),
    size: formatBytes(file.size),
    date: formatDateShort(todayISO()),
    url, path,
  });
  toast('File uploaded', 'success');
  loadDocuments();
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

  document.getElementById('np-nda-content').innerHTML = generateNDAContent(client, address, contact, email, purpose, dateVal, brand);

  document.getElementById('np-circle-1').className = 'step-circle done';
  document.getElementById('np-circle-1').textContent = '\u2713';
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

  const exists = await findClientByName(client, _clients);
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
  document.getElementById('np-circle-2').textContent = '\u2713';
  document.getElementById('np-label-2').className = 'step-label';
  document.getElementById('np-circle-3').className = 'step-circle active';
  document.getElementById('np-circle-3').textContent = '3';
  document.getElementById('np-label-3').className = 'step-label active';

  toast(`Project created for ${client}`, 'success');
  setTimeout(() => showPage('projects'), 1400);
}

export async function loadImpact() {
  setImpactEntries(await fetchImpactEntries());
  renderImpact();
}

export function renderImpact() {
  const totals = { students: 0, teachers: 0, smes: 0, lgus: 0 };
  _impactEntries.forEach(e => {
    totals.students += e.students_reached  || 0;
    totals.teachers += e.teachers_trained  || 0;
    totals.smes     += e.smes_supported    || 0;
    totals.lgus     += e.lgus_engaged      || 0;
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
            <div style="font-weight:600;color:var(--ink)">${escapeHtml(e.period)} \u2014 ${escapeHtml(e.program)}</div>
            <div style="color:var(--ink-3);font-size:10.5px;margin-top:2px">
              ${e.students_reached || 0} students \u00b7 ${e.teachers_trained || 0} teachers \u00b7 ${e.smes_supported || 0} SMEs \u00b7 ${e.lgus_engaged || 0} LGUs
            </div>
          </div>
        </div>`).join('')
    : '<div style="color:var(--ink-3);font-size:11.5px;padding:8px 0">No entries yet \u2014 log your first entry.</div>';
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
  ['imp-period','imp-program','imp-students','imp-teachers','imp-smes','imp-lgus'].forEach(id => {
    document.getElementById(id).value = '';
  });
  loadImpact();
}

export function downloadNDA() {
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
