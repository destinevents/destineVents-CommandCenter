let _clients   = [];
let _proposals = [];
let _partners  = [];
let _documents = [];
let _invoices  = [];
let _bills     = [];
let _payroll   = [];

let _onSave = null;

function toast(msg, type) {
  showToast(msg, type, 3200);
}

function openModal(title, bodyHTML, onSave) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-overlay').classList.add('open');
  _onSave = onSave;
  const saveBtn = document.getElementById('modal-save-btn');
  if (saveBtn) setTimeout(() => saveBtn.focus(), 100);
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  _onSave = null;
}

function saveModal() { if (_onSave) _onSave(); }

async function init() {
  const session = await getSession();
  if (session) {
    const { data: profile } = await sb.from('intern_users').select('role').eq('id', session.user.id).single();
    const role = profile?.role || 'intern';
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
  const now = new Date();
  const dateFmt = now.toLocaleDateString('en-PH', { weekday:'short', month:'long', day:'numeric', year:'numeric' });
  const dateEl = document.getElementById('topbar-date');
  if (dateEl) dateEl.textContent = dateFmt;
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

function setupRealtime() {
  if (!sb) return;
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
      const pageEl = document.getElementById('page-' + page);
      if (pageEl && pageEl.classList.contains('active')) {
        reload();
      }
      if (payload.eventType === 'INSERT') {
        toast(`New ${table.replace('_runs', '')} added`, 'success');
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
  const { data, error } = await signIn(email, pass);
  if (error) { errEl.textContent = error.message; return; }
  const name = data.user.user_metadata?.full_name || data.user.user_metadata?.name || '';
  enterApp(data.user.email, name);
}

async function handleSignOut() {
  await signOut();
  location.reload();
}

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
    case 'ai':          break;
    case 'new-project': resetNewProject();  break;
  }
}

function filterTable(input, tbodyId) {
  const q = input.value.toLowerCase();
  document.querySelectorAll('#' + tbodyId + ' tr').forEach(tr =>{
    tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

init();
