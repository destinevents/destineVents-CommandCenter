async function loadClients() {
  _clients = await fetchClients();
  renderClients(_clients);
}

function renderClients(clients) {
  const total = clients.reduce((s,c) =>s + (c.total_value||0), 0);
  document.getElementById('clients-summary').textContent =
    `${clients.length} clients \u00B7 ${formatCurrency(total)} total value`;
  document.getElementById('clients-tbody').innerHTML = clients.length
    ? clients.map(c => `
        <tr>
          <td><div class="project-name">${c.name}</div><div class="project-client">${c.type}</div></td>
          <td><span class="badge badge-${statusClass(c.status)}">${c.status}</span></td>
          <td style="font-size:11px;color:var(--ink-3)">${c.brand||'\u2014'}</td>
          <td style="font-size:12px">${c.contact||'\u2014'}</td>
          <td style="font-size:11px;color:var(--ink-3)">${c.email||'\u2014'}</td>
          <td class="project-value">${formatCurrency(c.total_value)}</td>
        </tr>`).join('')
    : `<tr><td colspan="6"><div class="empty-state">No clients yet \u2014 add your first one</div></td></tr>`;
}

function openAddClient() {
  openModal('Add Client', `
    <div class="form-grid">
      <div class="form-group"><div class="form-label">Client Name</div><input class="form-input" id="fc-name" placeholder="e.g. DTI CAR"/></div>
      <div class="form-group"><div class="form-label">Type</div>
        <select class="form-input" id="fc-type">${APP_SETTINGS.finance.clientTypes.map(t => `<option>${t}</option>`).join('')}</select>
      </div>
      <div class="form-group"><div class="form-label">Brand</div>
        <select class="form-input" id="fc-brand">${APP_SETTINGS.company.brands.map(b => `<option>${b}</option>`).join('')}</select>
      </div>
      <div class="form-group"><div class="form-label">Status</div>
        <select class="form-input" id="fc-status">${APP_SETTINGS.finance.clientStatuses.map(s => `<option>${s}</option>`).join('')}</select>
      </div>
      <div class="form-group"><div class="form-label">Contact Person</div><input class="form-input" id="fc-contact" placeholder="Full name"/></div>
      <div class="form-group"><div class="form-label">Email</div><input class="form-input" id="fc-email" type="email" placeholder="email@org.ph"/></div>
    </div>`, saveClient);
}

async function saveClient() {
  const name = document.getElementById('fc-name').value.trim();
  const err = validateRequired(name, 'Client name');
  if (err) { toast(err, 'error'); return; }
  const result = await createClient({
    name,
    type:    document.getElementById('fc-type').value,
    brand:   document.getElementById('fc-brand').value,
    status:  document.getElementById('fc-status').value,
    contact: document.getElementById('fc-contact').value,
    email:   document.getElementById('fc-email').value,
    total_value: 0,
  });
  if (!result) return;
  toast('Client added', 'success');
  closeModal(); loadClients();
}

async function loadProposals() {
  _proposals = await fetchProposals();
  renderProposals(_proposals);
}

function renderProposals(proposals) {
  const stats = calcWinRate(proposals);
  document.getElementById('win-rate-pct').textContent = stats.winRate + '%';
  document.getElementById('win-rate-breakdown').innerHTML =
    `<div>${stats.won} won \u00B7 ${stats.lost} lost \u00B7 ${stats.total - stats.closed} open</div>
     <div>Closed: <strong>${stats.closed} of ${stats.total}</strong></div>`;
  document.getElementById('proposals-value-summary').innerHTML =
    `<div>Total: <strong>${formatCurrency(stats.wonValue + stats.pipelineValue)}</strong></div>
     <div>Won: <strong style="color:var(--green)">${formatCurrency(stats.wonValue)}</strong></div>
     <div>In pipeline: <strong style="color:var(--blue)">${formatCurrency(stats.pipelineValue)}</strong></div>`;
  document.getElementById('proposals-summary').textContent = `${stats.total} proposals`;
  document.getElementById('proposals-tbody').innerHTML = proposals.length
    ? proposals.map(p => `
        <tr>
          <td><div class="project-name">${p.name}</div><div class="project-client">${p.client}</div></td>
          <td class="project-value">${formatCurrency(p.value)}</td>
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
      <div class="form-group"><div class="form-label">Value (\u20B1)</div><input class="form-input" id="fp-value" type="number" placeholder="0"/></div>
      <div class="form-group"><div class="form-label">Date Sent</div><input class="form-input" id="fp-sent" type="date"/></div>
      <div class="form-group"><div class="form-label">Follow-up Date</div><input class="form-input" id="fp-followup" type="date"/></div>
      <div class="form-group"><div class="form-label">Status</div>
        <select class="form-input" id="fp-status">${APP_SETTINGS.finance.proposalStatuses.map(s => `<option>${s}</option>`).join('')}</select>
      </div>
    </div>`, saveProposal);
}

async function saveProposal() {
  const name = document.getElementById('fp-name').value.trim();
  const err = validateRequired(name, 'Proposal name');
  if (err) { toast(err, 'error'); return; }
  const result = await createProposal({
    name,
    client:   document.getElementById('fp-client').value,
    value:    +document.getElementById('fp-value').value||0,
    sent:     formatDateShort(document.getElementById('fp-sent').value),
    followup: formatDateShort(document.getElementById('fp-followup').value),
    status:   document.getElementById('fp-status').value,
  });
  if (!result) return;
  toast('Proposal added', 'success');
  closeModal(); loadProposals();
}
