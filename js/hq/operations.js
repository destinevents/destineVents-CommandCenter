async function loadPartners() {
  const { data } = await fetchPartners();
  if (data) { _partners = data; }
  renderPartners(_partners);
}

function renderPartners(list) {
  const grid = document.getElementById('partners-grid');
  grid.innerHTML = list.length
    ? list.map(p=>`
        <div class="partner-card">
          <div class="partner-type-tag">${p.type}</div>
          <div class="partner-name">${p.name}</div>
          <div class="partner-contact">${p.contact||''}<br>${p.email||''}</div>
        </div>`).join('')
    : `<div style="grid-column:1/-1"><div class="empty-state">No partners in this category</div></div>`;
}

function filterPartners(type, el) {
  document.querySelectorAll('.partner-filter-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  renderPartners(type==='all' ? _partners : _partners.filter(p=>p.type===type));
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
  if (!name) { toast('Organization name is required','error'); return; }
  const data = {
    id: Date.now(), name,
    type:    document.getElementById('fpr-type').value,
    contact: document.getElementById('fpr-contact').value,
    email:   document.getElementById('fpr-email').value,
  };
  const { error } = await createPartner(data);
  if (error) { toast(error.message,'error'); return; }
  toast('Partner added','success');
  closeModal(); loadPartners();
}

async function loadDocuments() {
  const { data } = await fetchDocuments();
  if (data) { _documents = data; }
  renderDocuments(_documents);
}

function renderDocuments(docs) {
  document.getElementById('doc-list').innerHTML = docs.length
    ? docs.map(d=>`
        <div class="doc-item">
          <div class="doc-icon">${docTypeIcon(d.type)}</div>
          <div>
            <div class="doc-name">${d.name}</div>
            <div class="doc-meta">${d.type} · ${d.size} · ${d.date}</div>
          </div>
          <div class="doc-actions">
            <button class="doc-btn" onclick="toast('Connect Supabase Storage to enable real file downloads','')">Download</button>
          </div>
        </div>`).join('')
    : `<div class="empty-state">No documents yet — upload your first file above</div>`;
}

function handleFileSelect(files) {
  if (!files||!files.length) return;
  const file = files[0];
  document.getElementById('file-input').value = '';
  uploadToStorage(file);
}

async function uploadToStorage(file) {
  toast('Uploading…');
  const path = `${Date.now()}-${file.name}`;
  const { error } = await uploadDocument(file, path);
  if (error) { toast(error.message,'error'); return; }
  const url = getDocumentPublicUrl(path);
  await saveDocumentMeta({
    name: file.name, type: guessDocType(file.name),
    size: formatBytes(file.size),
    date: new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}),
    url, path,
  });
  toast('File uploaded','success');
  loadDocuments();
}

function resetNewProject() {
  document.getElementById('np-step1').style.display = 'block';
  document.getElementById('np-step2').style.display = 'none';
  const set = (id, cls, txt) =>{ const el = document.getElementById(id); el.className = cls; if (txt !== undefined) el.textContent = txt; };
  set('np-circle-1','step-circle active','1'); set('np-label-1','step-label active');
  set('np-circle-2','step-circle','2');        set('np-label-2','step-label');
  set('np-circle-3','step-circle','3');        set('np-label-3','step-label');
}

function npGoStep2() {
  const client = document.getElementById('np-client').value.trim();
  if (!client) { toast('Client name is required','error'); return; }
  const address = document.getElementById('np-address').value.trim() || '[Address]';
  const purpose = document.getElementById('np-purpose').value.trim() || 'business engagement';
  const dateVal = document.getElementById('np-date').value;
  const dateStr = dateVal
    ? new Date(dateVal + 'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})
    : new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});

  document.getElementById('np-nda-content').innerHTML = `
    <h3>Non-Disclosure Agreement</h3>
    <p>This Non-Disclosure Agreement is entered into as of <strong>${dateStr}</strong>, between:</p>
    <p><strong>DestineVents Collective OPC</strong>, a One Person Corporation registered under Philippine law, Baguio City, represented by <strong>Jennifer Castro, Founder</strong>("Disclosing Party");</p>
    <p>AND <strong>${client}</strong>, ${address} ("Receiving Party").</p>
    <p><strong>1. PURPOSE.</strong>The parties wish to explore a potential business relationship regarding <strong>${purpose}</strong>. In connection with this purpose, the Disclosing Party may share certain confidential information with the Receiving Party.</p>
    <p><strong>2. CONFIDENTIAL INFORMATION</strong>means any information disclosed by DestineVents Collective that is designated as confidential or that reasonably should be understood to be confidential given the nature of the information and the circumstances of disclosure, including but not limited to business plans, financial data, client lists, pricing, and proprietary processes.</p>
    <p><strong>3. OBLIGATIONS.</strong>The Receiving Party shall: (a) hold the Confidential Information in strict confidence; (b) not disclose it to any third party without prior written consent; (c) use it solely for the purpose stated above; and (d) protect it with at least the same degree of care used for its own confidential information.</p>
    <p><strong>4. EXCLUSIONS.</strong>These obligations do not apply to information that: (a) is or becomes publicly available through no breach of this Agreement; (b) was independently known to the Receiving Party; or (c) is independently developed without use of Confidential Information.</p>
    <p><strong>5. TERM.</strong>This Agreement shall remain in effect for two (2) years from the date of execution.</p>
    <p><strong>6. GOVERNING LAW.</strong>This Agreement shall be governed by the laws of the Republic of the Philippines.</p>
    <p><strong>IN WITNESS WHEREOF</strong>, the parties have executed this Agreement as of the date first written above.</p>`;

  const c1 = document.getElementById('np-circle-1'); c1.className='step-circle done'; c1.textContent='✓';
  document.getElementById('np-label-1').className = 'step-label';
  const c2 = document.getElementById('np-circle-2'); c2.className='step-circle active'; c2.textContent='2';
  document.getElementById('np-label-2').className = 'step-label active';
  document.getElementById('np-step1').style.display = 'none';
  document.getElementById('np-step2').style.display = 'block';
}

function npGoStep1() {
  document.getElementById('np-step1').style.display = 'block';
  document.getElementById('np-step2').style.display = 'none';
  const c1 = document.getElementById('np-circle-1'); c1.className='step-circle active'; c1.textContent='1';
  document.getElementById('np-label-1').className = 'step-label active';
  const c2 = document.getElementById('np-circle-2'); c2.className='step-circle'; c2.textContent='2';
  document.getElementById('np-label-2').className = 'step-label';
}

function npFinish() {
  const client  = document.getElementById('np-client').value.trim();
  const contact = document.getElementById('np-contact').value.trim();
  const email   = document.getElementById('np-email').value.trim();
  const brand   = document.getElementById('np-brand').value;

  if (!_clients.find(c =>c.name.toLowerCase() === client.toLowerCase())) {
    _clients.push({ id:Date.now(), name:client, type:'Corporate', brand, contact, email, total_value:0, status:'NDA Signed' });
  }

  const c2 = document.getElementById('np-circle-2'); c2.className='step-circle done'; c2.textContent='✓';
  document.getElementById('np-label-2').className = 'step-label';
  const c3 = document.getElementById('np-circle-3'); c3.className='step-circle active'; c3.textContent='3';
  document.getElementById('np-label-3').className = 'step-label active';

  toast(`Project created for ${client}`, 'success');
  setTimeout(() =>showPage('clients'), 1400);
}

function downloadNDA() {
  const client  = document.getElementById('np-client').value.trim() || 'Client';
  const address = document.getElementById('np-address').value.trim();
  const purpose = document.getElementById('np-purpose').value.trim() || 'Business Engagement';
  const dateVal = document.getElementById('np-date').value;
  const dateStr = dateVal
    ? new Date(dateVal + 'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})
    : new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});

  const w = window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>NDA — ${client}</title>
  <style>
    body{font-family:Georgia,serif;font-size:11pt;line-height:1.85;max-width:680px;margin:50px auto;color:#111;padding:0 24px}
    h3{text-align:center;letter-spacing:.08em;text-transform:uppercase;font-size:12pt;margin-bottom:20px}
    p{margin-bottom:13px;text-align:justify}
    .sig{display:flex;justify-content:space-between;margin-top:60px;gap:40px}
    .sig-col{flex:1}.sig-line{border-top:1px solid #333;margin-bottom:6px}.sig-name{font-size:9pt;color:#444}
    @media print{body{margin:30px auto}}
  </style></head><body>
  <h3>Non-Disclosure Agreement</h3>
  <p>This Non-Disclosure Agreement ("Agreement") is entered into as of <strong>${dateStr}</strong>, between:</p>
  <p><strong>DestineVents Collective OPC</strong>, a One Person Corporation registered under Philippine law, Baguio City, represented by <strong>Jennifer Castro, Founder</strong>("Disclosing Party");</p>
  <p>AND <strong>${client}</strong>${address?', '+address:''} ("Receiving Party").</p>
  <p><strong>1. PURPOSE.</strong>The parties wish to explore a potential business relationship regarding <strong>${purpose}</strong>. In connection with this purpose, the Disclosing Party may share certain confidential information with the Receiving Party.</p>
  <p><strong>2. CONFIDENTIAL INFORMATION</strong>means any information disclosed by DestineVents Collective that is designated as confidential or that reasonably should be understood to be confidential given the nature of the information and the circumstances of disclosure, including but not limited to business plans, financial data, client lists, pricing, and proprietary processes.</p>
  <p><strong>3. OBLIGATIONS.</strong>The Receiving Party shall: (a) hold the Confidential Information in strict confidence; (b) not disclose it to any third party without prior written consent; (c) use it solely for the purpose stated above; and (d) protect it with at least the same degree of care used for its own confidential information.</p>
  <p><strong>4. EXCLUSIONS.</strong>These obligations do not apply to information that: (a) is or becomes publicly available through no breach of this Agreement; (b) was independently known to the Receiving Party; or (c) is independently developed without use of Confidential Information.</p>
  <p><strong>5. TERM.</strong>This Agreement shall remain in effect for two (2) years from the date of execution.</p>
  <p><strong>6. GOVERNING LAW.</strong>This Agreement shall be governed by the laws of the Republic of the Philippines.</p>
  <p><strong>IN WITNESS WHEREOF</strong>, the parties have executed this Agreement as of the date first written above.</p>
  <div class="sig">
    <div class="sig-col"><div class="sig-line"></div><div class="sig-name"><strong>DestineVents Collective OPC</strong><br>Jennifer Castro, Founder</div></div>
    <div class="sig-col"><div class="sig-line"></div><div class="sig-name"><strong>${client}</strong><br>Authorized Representative</div></div>
  </div>
  </body></html>`);
  w.document.close();
  setTimeout(() =>{ w.focus(); w.print(); }, 400);
}
