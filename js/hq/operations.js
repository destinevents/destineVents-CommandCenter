async function loadPartners() {
  _partners = await fetchPartners();
  renderPartners(_partners);
}

function renderPartners(list) {
  const grid = document.getElementById('partners-grid');
  grid.innerHTML = list.length
    ? list.map(p => `
        <div class="partner-card">
          <div class="partner-type-tag">${p.type}</div>
          <div class="partner-name">${p.name}</div>
          <div class="partner-contact">${p.contact||''}<br>${p.email||''}</div>
        </div>`).join('')
    : `<div style="grid-column:1/-1"><div class="empty-state">No partners in this category</div></div>`;
}

function filterPartners(type, el) {
  document.querySelectorAll('.partner-filter-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderPartners(filterPartnersByType(_partners, type));
}

function openAddPartner() {
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

async function savePartner() {
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

async function loadDocuments() {
  _documents = await fetchDocuments();
  renderDocuments(_documents);
}

function renderDocuments(docs) {
  document.getElementById('doc-list').innerHTML = docs.length
    ? docs.map(d => `
        <div class="doc-item">
          <div class="doc-icon">${docTypeIcon(d.type)}</div>
          <div>
            <div class="doc-name">${d.name}</div>
            <div class="doc-meta">${d.type} \u00B7 ${d.size} \u00B7 ${d.date}</div>
          </div>
          <div class="doc-actions">
            <button class="doc-btn" onclick="toast('Connect Supabase Storage to enable real file downloads','')">Download</button>
          </div>
        </div>`).join('')
    : `<div class="empty-state">No documents yet \u2014 upload your first file above</div>`;
}

function handleFileSelect(files) {
  if (!files || !files.length) return;
  document.getElementById('file-input').value = '';
  uploadToStorage(files[0]);
}

async function uploadToStorage(file) {
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

function npGoStep2() {
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

function npGoStep1() {
  document.getElementById('np-step1').style.display = 'block';
  document.getElementById('np-step2').style.display = 'none';
  document.getElementById('np-circle-1').className = 'step-circle active';
  document.getElementById('np-circle-1').textContent = '1';
  document.getElementById('np-label-1').className = 'step-label active';
  document.getElementById('np-circle-2').className = 'step-circle';
  document.getElementById('np-circle-2').textContent = '2';
  document.getElementById('np-label-2').className = 'step-label';
}

async function npFinish() {
  const client  = document.getElementById('np-client').value.trim();
  const contact = document.getElementById('np-contact').value.trim();
  const email   = document.getElementById('np-email').value.trim();
  const brand   = document.getElementById('np-brand').value;

  const exists = await findClientByName(client, _clients);
  if (!exists) {
    await createClient({
      name: client, type: 'Corporate', brand, contact, email,
      total_value: 0, status: 'NDA Signed',
    });
  }

  document.getElementById('np-circle-2').className = 'step-circle done';
  document.getElementById('np-circle-2').textContent = '\u2713';
  document.getElementById('np-label-2').className = 'step-label';
  document.getElementById('np-circle-3').className = 'step-circle active';
  document.getElementById('np-circle-3').textContent = '3';
  document.getElementById('np-label-3').className = 'step-label active';

  toast(`Project created for ${client}`, 'success');
  setTimeout(() => showPage('clients'), 1400);
}

function downloadNDA() {
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
