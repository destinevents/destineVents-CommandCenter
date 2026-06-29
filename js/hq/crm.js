async function loadClients() {
  const { data } = await fetchClients();
  if (data) { _clients = data; }
  renderClients(_clients);
}

function renderClients(clients) {
  const total = clients.reduce((s,c) =>s + (c.total_value||0), 0);
  document.getElementById('clients-summary').textContent =
    `${clients.length} clients · ₱${num(total)} total value`;
  document.getElementById('clients-tbody').innerHTML = clients.length
    ? clients.map(c =>`
        <tr>
          <td><div class="project-name">${c.name}</div><div class="project-client">${c.type}</div></td>
          <td><span class="badge badge-${statusClass(c.status)}">${c.status}</span></td>
          <td style="font-size:11px;color:var(--ink-3)">${c.brand||'—'}</td>
          <td style="font-size:12px">${c.contact||'—'}</td>
          <td style="font-size:11px;color:var(--ink-3)">${c.email||'—'}</td>
          <td class="project-value">₱${num(c.total_value)}</td>
        </tr>`).join('')
    : `<tr><td colspan="6"><div class="empty-state">No clients yet — add your first one</div></td></tr>`;
}

function openAddClient() {
  openModal('Add Client', `
    <div class="form-grid">
      <div class="form-group"><div class="form-label">Client Name</div><input class="form-input" id="fc-name" placeholder="e.g. DTI CAR"/></div>
      <div class="form-group"><div class="form-label">Type</div>
        <select class="form-input" id="fc-type"><option>Government</option><option>Corporate</option><option>Education</option><option>NGO</option><option>Community</option><option>Startup</option></select>
      </div>
      <div class="form-group"><div class="form-label">Brand</div>
        <select class="form-input" id="fc-brand"><option>DestineVents</option><option>DDC</option><option>AYA</option></select>
      </div>
      <div class="form-group"><div class="form-label">Status</div>
        <select class="form-input" id="fc-status"><option>Lead</option><option>Active</option><option>NDA Signed</option><option>Completed</option></select>
      </div>
      <div class="form-group"><div class="form-label">Contact Person</div><input class="form-input" id="fc-contact" placeholder="Full name"/></div>
      <div class="form-group"><div class="form-label">Email</div><input class="form-input" id="fc-email" type="email" placeholder="email@org.ph"/></div>
    </div>`, saveClient);
}

async function saveClient() {
  const name = document.getElementById('fc-name').value.trim();
  if (!name) { toast('Client name is required','error'); return; }
  const data = {
    id: Date.now(), name,
    type:    document.getElementById('fc-type').value,
    brand:   document.getElementById('fc-brand').value,
    status:  document.getElementById('fc-status').value,
    contact: document.getElementById('fc-contact').value,
    email:   document.getElementById('fc-email').value,
    total_value: 0,
  };
  const { error } = await createClient(data);
  if (error) { toast(error.message,'error'); return; }
  toast('Client added','success');
  closeModal(); loadClients();
}

async function loadProposals() {
  const { data } = await fetchProposals();
  if (data) { _proposals = data; }
  renderProposals(_proposals);
}

function renderProposals(proposals) {
  const won     = proposals.filter(p =>p.status==='Won').length;
  const lost    = proposals.filter(p =>p.status==='Lost').length;
  const closed  = won + lost;
  const rate    = closed ? Math.round((won/closed)*100) : 0;
  const totalVal   = proposals.reduce((s,p) =>s+(p.value||0), 0);
  const wonVal     = proposals.filter(p=>p.status==='Won').reduce((s,p)=>s+(p.value||0),0);
  const pendingVal = proposals.filter(p=>p.status==='Sent').reduce((s,p)=>s+(p.value||0),0);

  document.getElementById('win-rate-pct').textContent = rate + '%';
  document.getElementById('win-rate-breakdown').innerHTML =
    `<div>${won} won · ${lost} lost · ${proposals.filter(p=>p.status==='Sent').length} open</div>
     <div>Closed: <strong>${closed} of ${proposals.length}</strong></div>`;
  document.getElementById('proposals-value-summary').innerHTML =
    `<div>Total: <strong>₱${num(totalVal)}</strong></div>
     <div>Won: <strong style="color:var(--green)">₱${num(wonVal)}</strong></div>
     <div>In pipeline: <strong style="color:var(--blue)">₱${num(pendingVal)}</strong></div>`;
  document.getElementById('proposals-summary').textContent = `${proposals.length} proposals`;
  document.getElementById('proposals-tbody').innerHTML = proposals.length
    ? proposals.map(p =>`
        <tr>
          <td><div class="project-name">${p.name}</div><div class="project-client">${p.client}</div></td>
          <td class="project-value">₱${num(p.value)}</td>
          <td style="font-size:11px;color:var(--ink-3)">${p.sent}</td>
          <td style="font-size:11px;color:var(--ink-3)">${p.followup}</td>
          <td><span class="badge badge-${statusClass(p.status)}">${p.status}</span></td>
        </tr>`).join('')
    : `<tr><td colspan="5"><div class="empty-state">No proposals yet</div></td></tr>`;
}

function openAddProposal() {
  openModal('New Proposal', `
    <div class="form-grid">
      <div class="form-group full"><div class="form-label">Proposal Name</div><input class="form-input" id="fp-name" placeholder="e.g. DTI CAR MSME Summit"/></div>
      <div class="form-group"><div class="form-label">Client</div><input class="form-input" id="fp-client" placeholder="Client name"/></div>
      <div class="form-group"><div class="form-label">Value (₱)</div><input class="form-input" id="fp-value" type="number" placeholder="0"/></div>
      <div class="form-group"><div class="form-label">Date Sent</div><input class="form-input" id="fp-sent" type="date"/></div>
      <div class="form-group"><div class="form-label">Follow-up Date</div><input class="form-input" id="fp-followup" type="date"/></div>
      <div class="form-group"><div class="form-label">Status</div>
        <select class="form-input" id="fp-status"><option>Sent</option><option>Won</option><option>Lost</option><option>Expired</option></select>
      </div>
    </div>`, saveProposal);
}

async function saveProposal() {
  const name = document.getElementById('fp-name').value.trim();
  if (!name) { toast('Proposal name is required','error'); return; }
  const data = {
    id: Date.now(), name,
    client:   document.getElementById('fp-client').value,
    value:    +document.getElementById('fp-value').value||0,
    sent:     fmtDate(document.getElementById('fp-sent').value),
    followup: fmtDate(document.getElementById('fp-followup').value),
    status:   document.getElementById('fp-status').value,
  };
  const { error } = await createProposal(data);
  if (error) { toast(error.message,'error'); return; }
  toast('Proposal added','success');
  closeModal(); loadProposals();
}
