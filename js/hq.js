// ─── CONSTANTS ───────────────────────────────────────────────────────────────


// ─── LIVE DATA (localStorage-backed) ─────────────────────────────────────────
let _clients   = [];
let _proposals = [];
let _partners  = [];
let _documents = [];
let _invoices  = [];
let _bills     = [];
let _payroll   = [];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const num = n =>(+(n)||0).toLocaleString('en-PH');

function statusClass(s='') {
  return ({
    'Active':'active','Completed':'completed','NDA Signed':'nda','Lead':'lead','Proposal':'proposal',
    'Paid':'paid','Unpaid':'unpaid','Overdue':'overdue',
    'Won':'won','Lost':'lost','Sent':'sent','Expired':'expired',
    'Released':'released','Pending':'pending','Draft':'draft',
  })[s] || 'lead';
}

function docTypeIcon(t) {
  return {'NDA':'📋','Contract':'📄','Proposal':'📝','Agreement':'🤝','Document':'📁'}[t]||'📁';
}

function guessDocType(name) {
  const n = name.toLowerCase();
  if (n.includes('nda'))                            return 'NDA';
  if (n.includes('contract'))                       return 'Contract';
  if (n.includes('proposal'))                       return 'Proposal';
  if (n.includes('agreement') || n.includes('mou')) return 'Agreement';
  return 'Document';
}

function formatBytes(b) {
  if (b < 1024)       return b + ' B';
  if (b < 1024*1024)  return Math.round(b/1024) + ' KB';
  return (b/1024/1024).toFixed(1) + ' MB';
}

function fmtDate(isoVal) {
  if (!isoVal) return '—';
  return new Date(isoVal + 'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
function toast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  // reset to retrigger the slide-in animation on every call
  t.className = 'toast' + (type ? ' '+type : '');
  void t.offsetWidth;
  t.classList.add('visible');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('visible'), 3200);
}

// ─── MODAL ───────────────────────────────────────────────────────────────────
let _onSave = null;
function openModal(title, bodyHTML, onSave) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-overlay').classList.add('open');
  _onSave = onSave;
}
function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  _onSave = null;
}
function saveModal() { if (_onSave) _onSave(); }

// ─── AUTH ─────────────────────────────────────────────────────────────────────
async function init() {
  const { data:{ session } } = await sb.auth.getSession();
  if (session) {
    const role = session.user.user_metadata?.role || 'intern';
    if (role !== 'admin') {
      window.location.href = 'intern.html';
      return;
    }
    const name = session.user.user_metadata?.full_name || session.user.user_metadata?.name || '';
    enterApp(session.user.email, name);
  } else {
    document.getElementById('login-screen').style.display = 'flex';
  }
}

function enterApp(email, name) {
  document.getElementById('login-screen').style.display = 'none';
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  document.getElementById('dashboard-greeting').textContent = name ? `${timeOfDay}, ${name}.` : `${timeOfDay}.`;
  // Topbar date
  const now = new Date();
  const dateFmt = now.toLocaleDateString('en-PH', { weekday:'short', month:'long', day:'numeric', year:'numeric' });
  const dateEl = document.getElementById('topbar-date');
  if (dateEl) dateEl.textContent = dateFmt;
  // Avatar / email
  if (email) {
    const initials = email.split('@')[0].slice(0,2).toUpperCase();
    const av = document.getElementById('topbar-avatar');
    const sav = document.getElementById('sidebar-avatar');
    const sem = document.getElementById('sidebar-email');
    if (av) av.textContent = initials;
    if (sav) sav.textContent = initials;
    if (sem) sem.textContent = email;
  }
  const savedKey = '';
  if (savedKey) { const k = document.getElementById('ai-api-key'); if (k) k.value = savedKey; }
  setupRealtime();
  showPage('dashboard');
}

// ─── REALTIME ─────────────────────────────────────────────────────────────────
function setupRealtime() {
  if (!sb) return;

  // Which page to reload when each table changes
  const pageMap = {
    clients:      { page: 'clients',   reload: () => loadClients() },
    proposals:    { page: 'proposals', reload: () => loadProposals() },
    partners:     { page: 'partners',  reload: () => loadPartners() },
    invoices:     { page: 'finance',   reload: () => loadFinance() },
    bills:        { page: 'finance',   reload: () => loadFinance() },
    payroll_runs: { page: 'finance',   reload: () => loadFinance() },
    documents:    { page: 'documents', reload: () => loadDocuments() },
  };

  const ch = sb.channel('db-realtime');

  Object.entries(pageMap).forEach(([table, { page, reload }]) => {
    ch.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
      // Only re-render if that page is currently open
      const pageEl = document.getElementById('page-' + page);
      if (pageEl && pageEl.classList.contains('active')) {
        reload();
      }
      // Subtle indicator for changes from other users
      if (payload.eventType === 'INSERT') {
        toast(`New ${table.replace('_runs', '')} added by another user`, 'success');
      } else if (payload.eventType === 'DELETE') {
        toast(`A ${table.replace('_runs', '')} record was removed`, '');
      }
    });
  });

  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') console.log('Realtime connected');
  });
}

async function handleSignIn() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  if (!email || !pass) { errEl.textContent = 'Email and password required.'; return; }
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) { errEl.textContent = error.message; return; }
  const name = data.user.user_metadata?.full_name || data.user.user_metadata?.name || '';
  enterApp(data.user.email, name);
}

async function handleSignOut() {
  await sb.auth.signOut();
  location.reload();
}

// ─── NAVIGATION ──────────────────────────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p =>p.classList.remove('active'));
  const page = document.getElementById('page-' + name);
  if (page) { page.classList.add('active'); loadPage(name); }

  document.querySelectorAll('.nav-item').forEach(n =>n.classList.remove('active'));
  const activeNav = document.querySelector(`.nav-item[data-page="${name}"]`);
  if (activeNav) activeNav.classList.add('active');

  document.querySelectorAll('.tab').forEach(t =>t.classList.remove('active'));
  const activeTab = document.querySelector(`.tab[data-page="${name}"]`);
  if (activeTab) activeTab.classList.add('active');
}

function loadPage(name) {
  switch(name) {
    case 'clients':     loadClients();      break;
    case 'proposals':   loadProposals();    break;
    case 'partners':    loadPartners();     break;
    case 'documents':   loadDocuments();    break;
    case 'finance':     loadFinance();      break;
    case 'ai':          loadAIPage();       break;
    case 'new-project': resetNewProject();  break;
  }
}

// ─── FILTER (table search) ────────────────────────────────────────────────────
function filterTable(input, tbodyId) {
  const q = input.value.toLowerCase();
  document.querySelectorAll('#' + tbodyId + ' tr').forEach(tr =>{
    tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

// ─── CLIENTS ─────────────────────────────────────────────────────────────────
async function loadClients() {
  const { data } = await sb.from('clients').select('*').order('name');
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
  const { error } = await sb.from('clients').insert(data);
  if (error) { toast(error.message,'error'); return; }
  toast('Client added','success');
  closeModal(); loadClients();
}

// ─── PROPOSALS ───────────────────────────────────────────────────────────────
async function loadProposals() {
  const { data } = await sb.from('proposals').select('*').order('sent',{ascending:false});
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
  const { error } = await sb.from('proposals').insert(data);
  if (error) { toast(error.message,'error'); return; }
  toast('Proposal added','success');
  closeModal(); loadProposals();
}

// ─── FINANCE ─────────────────────────────────────────────────────────────────
async function loadFinance() {
  const [inv, bil, pay] = await Promise.all([
    sb.from('invoices').select('*').order('date',{ascending:false}),
    sb.from('bills').select('*').order('date',{ascending:false}),
    sb.from('payroll_runs').select('*').order('period',{ascending:false}),
  ]);
  if (inv.data) { _invoices = inv.data; }
  if (bil.data) { _bills    = bil.data; }
  if (pay.data) { _payroll  = pay.data; }
  renderFinanceOverview(_invoices, _bills);
  renderAR(_invoices);
  renderAP(_bills);
  renderPayroll(_payroll);
  renderBIR();
}

function showFinanceTab(name, el) {
  document.querySelectorAll('.ftab').forEach(t =>t.classList.remove('active'));
  document.getElementById('ftab-' + name).classList.add('active');
  document.querySelectorAll('#finance-subtabs .sub-tab').forEach(t =>t.classList.remove('active'));
  el.classList.add('active');
}

function renderFinanceOverview(invoices, bills) {
  const arOut   = invoices.filter(i=>i.status!=='Paid').reduce((s,i)=>s+i.amount,0);
  const apOut   = bills.filter(b=>b.status!=='Paid').reduce((s,b)=>s+b.amount,0);
  const rev     = invoices.filter(i=>i.status==='Paid').reduce((s,i)=>s+i.amount,0);
  const net     = arOut - apOut;
  const overdue = invoices.filter(i=>i.status==='Overdue').length;

  document.getElementById('finance-stats').innerHTML = `
    <div class="stat-card"><div class="stat-label">AR Outstanding</div><div class="stat-value" style="font-size:22px">₱${num(arOut)}</div><div class="stat-change">${overdue} overdue invoice${overdue!==1?'s':''}</div></div>
    <div class="stat-card"><div class="stat-label">AP Outstanding</div><div class="stat-value" style="font-size:22px">₱${num(apOut)}</div><div class="stat-change">${bills.filter(b=>b.status!=='Paid').length} pending bills</div></div>
    <div class="stat-card"><div class="stat-label">Revenue Collected</div><div class="stat-value" style="font-size:22px">₱${num(rev)}</div><div class="stat-change up">This quarter</div></div>
    <div class="stat-card"><div class="stat-label">Net Position</div><div class="stat-value" style="font-size:22px${net<0?';color:var(--red)':''}">₱${num(Math.abs(net))}</div><div class="stat-change ${net>=0?'up':''}">${net>=0?'Receivable surplus':'Payable deficit'}</div></div>`;

  document.getElementById('finance-recent-ar').innerHTML = invoices.slice(0,4).map(i=>`
    <div class="activity-item">
      <div class="activity-dot ${i.status==='Paid'?'green':i.status==='Overdue'?'red':'blue'}"></div>
      <div style="flex:1"><div class="activity-text">${i.client} — ${i.or_num}</div><div class="activity-time">${i.date}</div></div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-family:'Cormorant Garamond',serif;font-size:14px;font-weight:600">₱${num(i.amount)}</span>
        <span class="badge badge-${statusClass(i.status)}">${i.status}</span>
      </div>
    </div>`).join('');

  document.getElementById('finance-recent-ap').innerHTML = bills.slice(0,4).map(b=>`
    <div class="activity-item">
      <div class="activity-dot ${b.status==='Paid'?'green':'blue'}"></div>
      <div style="flex:1"><div class="activity-text">${b.payee}</div><div class="activity-time">${b.date} · EWT ${b.ewt}</div></div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-family:'Cormorant Garamond',serif;font-size:14px;font-weight:600">₱${num(b.amount)}</span>
        <span class="badge badge-${statusClass(b.status)}">${b.status}</span>
      </div>
    </div>`).join('');
}

function renderAR(invoices) {
  const total = invoices.reduce((s,i)=>s+i.amount,0);
  const out   = invoices.filter(i=>i.status!=='Paid').reduce((s,i)=>s+i.amount,0);
  document.getElementById('ar-summary').textContent = `${invoices.length} invoices · ₱${num(total)} total · ₱${num(out)} outstanding`;
  document.getElementById('ar-tbody').innerHTML = invoices.length
    ? invoices.map(i=>`
        <tr>
          <td style="font-size:11px;color:var(--ink-3)">${i.or_num}</td>
          <td style="font-weight:500;color:var(--ink)">${i.client}</td>
          <td class="amount-cell">₱${num(i.amount)}</td>
          <td style="font-size:11px;color:var(--ink-3)">${i.date}</td>
          <td style="font-size:11px;color:var(--ink-3)">${i.due}</td>
          <td><span class="badge badge-${statusClass(i.status)}">${i.status}</span></td>
        </tr>`).join('')
    : `<tr><td colspan="6"><div class="empty-state">No invoices yet</div></td></tr>`;
}

function renderAP(bills) {
  const total = bills.reduce((s,b)=>s+b.amount,0);
  const out   = bills.filter(b=>b.status!=='Paid').reduce((s,b)=>s+b.amount,0);
  document.getElementById('ap-summary').textContent = `${bills.length} bills · ₱${num(total)} total · ₱${num(out)} outstanding`;
  document.getElementById('ap-tbody').innerHTML = bills.length
    ? bills.map(b=>`
        <tr>
          <td style="font-weight:500;color:var(--ink)">${b.payee}</td>
          <td class="amount-cell">₱${num(b.amount)}</td>
          <td style="font-size:11px;color:var(--ink-3)">${b.date}</td>
          <td style="font-size:11px;color:var(--ink-3)">${b.category}</td>
          <td style="font-size:11px;color:var(--ink-3)">${b.ewt}</td>
          <td><span class="badge badge-${statusClass(b.status)}">${b.status}</span></td>
        </tr>`).join('')
    : `<tr><td colspan="6"><div class="empty-state">No bills yet</div></td></tr>`;
}

function renderPayroll(runs) {
  document.getElementById('payroll-tbody').innerHTML = runs.length
    ? runs.map(r=>`
        <tr>
          <td style="font-weight:500;color:var(--ink)">${r.period}</td>
          <td style="font-size:11.5px;color:var(--ink-3)">${r.employees}</td>
          <td class="amount-cell">₱${num(r.gross)}</td>
          <td style="font-size:12px;color:var(--ink-3)">₱${num(r.deductions)}</td>
          <td class="amount-cell">₱${num(r.net)}</td>
          <td><span class="badge badge-${statusClass(r.status)}">${r.status}</span></td>
        </tr>`).join('')
    : `<tr><td colspan="6"><div class="empty-state">No payroll runs yet</div></td></tr>`;
}

function renderBIR() {
  document.getElementById('bir-cards').innerHTML = `
    <div class="bir-card">
      <div class="bir-form-name">2551Q</div>
      <div class="bir-form-desc">Quarterly Percentage Tax Return<br>For non-VAT registered businesses</div>
      <div class="flex-between">
        <div class="bir-deadline">Q2 2026 deadline: <strong>Jul 25, 2026</strong></div>
        <span class="badge badge-unpaid">Due</span>
      </div>
      <div style="margin-top:10px;font-size:11px;color:var(--ink-3)">Q1 2026 — <span style="color:var(--green);font-weight:600">Filed ✓</span></div>
    </div>
    <div class="bir-card">
      <div class="bir-form-name">1701Q</div>
      <div class="bir-form-desc">Quarterly Income Tax Return<br>For self-employed / OPC founders</div>
      <div class="flex-between">
        <div class="bir-deadline">Q2 2026 deadline: <strong>Aug 15, 2026</strong></div>
        <span class="badge badge-unpaid">Due</span>
      </div>
      <div style="margin-top:10px;font-size:11px;color:var(--ink-3)">Q1 2026 — <span style="color:var(--green);font-weight:600">Filed ✓</span></div>
    </div>
    <div class="bir-card">
      <div class="bir-form-name">1604C</div>
      <div class="bir-form-desc">Annual Information Return — Income Taxes Withheld on Compensation</div>
      <div class="flex-between">
        <div class="bir-deadline">Next deadline: <strong>Jan 31, 2027</strong></div>
        <span class="badge badge-paid">Filed</span>
      </div>
      <div style="margin-top:10px;font-size:11px;color:var(--ink-3)">FY 2025 — <span style="color:var(--green);font-weight:600">Filed ✓</span></div>
    </div>
    <div class="bir-card">
      <div class="bir-form-name">2307</div>
      <div class="bir-form-desc">Certificate of Creditable Tax Withheld at Source — issue to clients per transaction</div>
      <div class="flex-between">
        <div class="bir-deadline">Issue per transaction</div>
        <span class="badge badge-lead">Ongoing</span>
      </div>
      <div style="margin-top:10px;font-size:11px;color:var(--ink-3)">Last issued: <span style="color:var(--ink);font-weight:600">Jun 2, 2026</span></div>
    </div>`;
}

function openAddInvoice() {
  openModal('New Invoice (AR)', `
    <div class="form-grid">
      <div class="form-group"><div class="form-label">OR Number</div><input class="form-input" id="fi-or" placeholder="OR-2026-005"/></div>
      <div class="form-group"><div class="form-label">Client</div><input class="form-input" id="fi-client" placeholder="Client name"/></div>
      <div class="form-group"><div class="form-label">Amount (₱)</div><input class="form-input" id="fi-amount" type="number" placeholder="0"/></div>
      <div class="form-group"><div class="form-label">Status</div>
        <select class="form-input" id="fi-status"><option>Unpaid</option><option>Paid</option><option>Overdue</option></select>
      </div>
      <div class="form-group"><div class="form-label">Date Issued</div><input class="form-input" id="fi-date" type="date"/></div>
      <div class="form-group"><div class="form-label">Due Date</div><input class="form-input" id="fi-due" type="date"/></div>
    </div>`, saveInvoice);
}

async function saveInvoice() {
  const or_num = document.getElementById('fi-or').value.trim();
  if (!or_num) { toast('OR number is required','error'); return; }
  const data = {
    id: Date.now(), or_num,
    client: document.getElementById('fi-client').value,
    amount: +document.getElementById('fi-amount').value||0,
    status: document.getElementById('fi-status').value,
    date:   fmtDate(document.getElementById('fi-date').value),
    due:    fmtDate(document.getElementById('fi-due').value),
  };
  const { error } = await sb.from('invoices').insert(data);
  if (error) { toast(error.message,'error'); return; }
  toast('Invoice added','success');
  closeModal(); loadFinance();
}

function openAddBill() {
  openModal('New Bill (AP)', `
    <div class="form-grid">
      <div class="form-group full"><div class="form-label">Payee</div><input class="form-input" id="fb-payee" placeholder="Supplier / vendor name"/></div>
      <div class="form-group"><div class="form-label">Amount (₱)</div><input class="form-input" id="fb-amount" type="number" placeholder="0"/></div>
      <div class="form-group"><div class="form-label">Category</div>
        <select class="form-input" id="fb-category"><option>Venue</option><option>Catering</option><option>Equipment</option><option>Services</option><option>Transport</option><option>Supplies</option><option>Other</option></select>
      </div>
      <div class="form-group"><div class="form-label">EWT Rate</div>
        <select class="form-input" id="fb-ewt"><option>0%</option><option>2%</option><option>5%</option><option>10%</option><option>15%</option></select>
      </div>
      <div class="form-group"><div class="form-label">Date</div><input class="form-input" id="fb-date" type="date"/></div>
      <div class="form-group"><div class="form-label">Status</div>
        <select class="form-input" id="fb-status"><option>Unpaid</option><option>Paid</option></select>
      </div>
    </div>`, saveBill);
}

async function saveBill() {
  const payee = document.getElementById('fb-payee').value.trim();
  if (!payee) { toast('Payee is required','error'); return; }
  const data = {
    id: Date.now(), payee,
    amount:   +document.getElementById('fb-amount').value||0,
    category: document.getElementById('fb-category').value,
    ewt:      document.getElementById('fb-ewt').value,
    date:     fmtDate(document.getElementById('fb-date').value),
    status:   document.getElementById('fb-status').value,
  };
  const { error } = await sb.from('bills').insert(data);
  if (error) { toast(error.message,'error'); return; }
  toast('Bill added','success');
  closeModal(); loadFinance();
}

function openAddPayroll() {
  openModal('New Payroll Run', `
    <div class="form-grid">
      <div class="form-group"><div class="form-label">Period</div><input class="form-input" id="pp-period" placeholder="e.g. Jun 2026"/></div>
      <div class="form-group"><div class="form-label">No. of Employees</div><input class="form-input" id="pp-emp" type="number" placeholder="0"/></div>
      <div class="form-group"><div class="form-label">Gross Pay (₱)</div><input class="form-input" id="pp-gross" type="number" placeholder="0" oninput="estimateDeductions()"/></div>
      <div class="form-group"><div class="form-label">Est. Deductions (₱)</div><input class="form-input" id="pp-ded" type="number" placeholder="0"/></div>
      <div class="form-group"><div class="form-label">Net Pay (₱)</div><input class="form-input" id="pp-net" type="number" placeholder="0"/></div>
      <div class="form-group"><div class="form-label">Status</div>
        <select class="form-input" id="pp-status"><option>Pending</option><option>Released</option></select>
      </div>
    </div>
    <div style="font-size:10px;color:var(--ink-3);margin-top:-8px">SSS ≈ 4.5% · PhilHealth ≈ 2.5% · Pag-IBIG ≈ 2% of gross</div>`, savePayroll);
}

function estimateDeductions() {
  const gross = +document.getElementById('pp-gross').value||0;
  const ded = Math.round(gross * 0.15);
  document.getElementById('pp-ded').value = ded;
  document.getElementById('pp-net').value = gross - ded;
}

async function savePayroll() {
  const period = document.getElementById('pp-period').value.trim();
  if (!period) { toast('Period is required','error'); return; }
  const gross = +document.getElementById('pp-gross').value||0;
  const ded   = +document.getElementById('pp-ded').value||0;
  const data  = {
    id: Date.now(), period,
    employees: +document.getElementById('pp-emp').value||0,
    gross, deductions: ded, net: gross - ded,
    status: document.getElementById('pp-status').value,
  };
  const { error } = await sb.from('payroll_runs').insert(data);
  if (error) { toast(error.message,'error'); return; }
  toast('Payroll run saved','success');
  closeModal(); loadFinance();
}

// ─── PARTNERS ────────────────────────────────────────────────────────────────
async function loadPartners() {
  const { data } = await sb.from('partners').select('*').order('name');
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
  const { error } = await sb.from('partners').insert(data);
  if (error) { toast(error.message,'error'); return; }
  toast('Partner added','success');
  closeModal(); loadPartners();
}

// ─── DOCUMENTS ───────────────────────────────────────────────────────────────
async function loadDocuments() {
  const { data } = await sb.from('documents').select('*').order('created_at',{ascending:false});
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
  const { error } = await sb.storage.from('documents').upload(path, file);
  if (error) { toast(error.message,'error'); return; }
  const url = sb.storage.from('documents').getPublicUrl(path).data.publicUrl;
  await sb.from('documents').insert({
    name: file.name, type: guessDocType(file.name),
    size: formatBytes(file.size),
    date: new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}),
    url, path,
  });
  toast('File uploaded','success');
  loadDocuments();
}

// ─── NEW PROJECT FLOW ─────────────────────────────────────────────────────────
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

// ─── AI ASSISTANT ─────────────────────────────────────────────────────────────
function loadAIPage() {}

function saveAIKey(val) {}

function selectTemplate(el) {
  document.querySelectorAll('.ai-template').forEach(t=>t.classList.remove('selected'));
  el.classList.add('selected');
}

function copyAIOutput() {
  const text = document.getElementById('ai-result').innerText;
  navigator.clipboard.writeText(text).then(()=>toast('Copied to clipboard','success'));
}

function buildAIPrompt(template, client, project, context) {
  const base = `You are a professional business writer for DestineVents Collective OPC, an event management and community development company in Baguio City, Philippines. Write in a warm, professional, and confident tone. Be concise and specific.`;
  const c = client || 'the client', p = project || 'our collaboration', x = context ? '\nContext: ' + context : '';
  const map = {
    'Follow-up Email':    `${base}\n\nWrite a professional follow-up email to ${c} regarding "${p}".${x}\nInclude: subject line, greeting, brief re-cap, clear next step, and warm closing from Jennifer Castro, Founder.`,
    'Proposal Summary':   `${base}\n\nWrite an executive proposal summary for ${c} for the project "${p}".${x}\nInclude: intro, scope overview, key deliverables (3-4 bullets), investment note, and compelling close.`,
    'Project Brief':      `${base}\n\nWrite a structured project brief for "${p}" with ${c}.${x}\nInclude: overview, objectives (3 points), scope of work, timeline note, and team note.`,
    'Monthly Report':     `${base}\n\nWrite a monthly business performance report for DestineVents.${x ? x : '\nCurrent month: ' + new Date().toLocaleDateString('en-US',{month:'long',year:'numeric'})}\nInclude: highlights, projects update, financials note, partnerships, next month outlook.`,
    'Impact Summary':     `${base}\n\nWrite a social impact narrative for "${p}" with ${c}.${x}\nInclude: program overview, key impact figures, beneficiaries, and CSR value statement.`,
    'Annual Report':      `${base}\n\nWrite an annual report narrative for DestineVents Collective OPC.${x}\nInclude: year in review, key achievements (3-5 points), financial highlights, community impact, partnerships, vision ahead.`,
  };
  return map[template] || map['Follow-up Email'];
}

async function simulateAI() {
  const apiKey  = '';
  const client  = document.getElementById('ai-client').value.trim();
  const project = document.getElementById('ai-project').value.trim();
  const context = document.getElementById('ai-context').value.trim();
  const templateName = document.querySelector('.ai-template.selected .ai-template-name')?.textContent || 'Follow-up Email';
  const r = document.getElementById('ai-result');

  if (!apiKey) {
    r.innerHTML = '<div style="color:var(--red);font-size:12px">Enter your Anthropic API key in the Settings section above to enable real AI generation.</div>';
    toast('API key required','error');
    return;
  }

  r.innerHTML = '<div class="ai-generating"><div class="dot-pulse"><span></span><span></span><span></span></div>&nbsp; Generating…</div>';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-allow-browser': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: buildAIPrompt(templateName, client, project, context) }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(()=>({}));
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '(no output)';
    r.innerHTML = `<div style="white-space:pre-line;font-size:12px;line-height:1.85;color:var(--ink-2)">${text}</div>`;
  } catch(e) {
    r.innerHTML = `<div style="color:var(--red);font-size:12px">Error: ${e.message}</div>`;
    toast(e.message, 'error');
  }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
init();
