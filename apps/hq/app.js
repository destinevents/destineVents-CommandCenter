// ─── HQ APP SHELL: auth, routing, realtime, dashboard, window shims ──────────
// Top of the module graph. index.html keeps its inline onclick handlers, so
// every function they reference is re-attached to window at the bottom.
import { sb } from '../../shared/services/supabase';
import { signIn, signOut, getSession } from '../../shared/services/authService.ts';
import { formatCurrency } from '../../shared/utils/formatUtils.ts';
import { formatDateShort, todayISO } from '../../shared/utils/dateUtils.ts';
import { escapeHtml } from '../../shared/utils/helpers.ts';
import { fetchClients } from '../../shared/services/clientService.js';
import { fetchProposals } from '../../shared/services/proposalService.js';
import { fetchPartners } from '../../shared/services/partnerService.js';
import { fetchInvoices, fetchBills } from '../../shared/services/financeService.js';
import { fetchProjects } from '../../shared/services/projectService.js';
import {
  _clients, _proposals, _partners, _invoices, _projects,
  setClients, setProposals, setPartners, setInvoices, setBills, setProjects,
} from './state.js';
import { toast, closeModal, saveModal, toggleHqNav } from './ui.js';
import {
  loadClients, openAddClient, openEditClient, handleDeleteClient, openClientDetail,
  loadProposals, openAddProposal, openEditProposal, handleDeleteProposal,
} from './crm.js';
import {
  loadPartners, filterPartners, openAddPartner, openEditPartner, handleDeletePartner,
  loadDocuments, handleFileSelect, openDocPreview, closeDocPreview, handleDeleteDocument,
  npGoStep2, npGoStep1, npFinish, downloadNDA,
  loadImpact, saveImpactEntry, openEditImpact, handleDeleteImpact,
} from './operations.js';
import {
  loadFinance, showFinanceTab, openFileBir,
  openAddInvoice, openEditInvoice, handleDeleteInvoice,
  openAddBill, openEditBill, handleDeleteBill,
  openAddPayroll, openEditPayroll, handleDeletePayroll,
  estimateDeductions,
} from './finance.js';
import { loadProjects, openAddProject, openEditProject, handleDeleteProject, convertProposalToProject } from './projects.js';
import { selectTemplate, copyAIOutput, simulateAI, initAIAutocomplete } from './ai.js';
import {
  loadEvents, openAddEvent, openEditEvent, handleDeleteEvent,
  filterEvents, viewEventRegistrations, backToEvents, copyRegisterUrl,
  handleUpdateRegistrationStatus, openIssueEventInvoice,
} from './events.js';

async function init() {
  const session = await getSession();
  if (session) {
    const { data: profile, error: profileError } = await sb
      .from('intern_users')
      .select('role')
      .eq('id', session.user.id)
      .single();
    if (profileError || !profile) {
      document.getElementById('login-screen').style.display = 'flex';
      document.getElementById('login-error').textContent =
        'Could not verify your account. Please sign in again.';
      return;
    }
    if (profile.role !== 'admin') {
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
  document.getElementById('dashboard-greeting').textContent = name
    ? `${timeOfDay}, ${name}.`
    : `${timeOfDay}.`;
  const now = new Date();
  const dateFmt = now.toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const dateEl = document.getElementById('topbar-date');
  if (dateEl) dateEl.textContent = dateFmt;
  if (email) {
    const initials = email.split('@')[0].slice(0, 2).toUpperCase();
    const av = document.getElementById('topbar-avatar');
    const sav = document.getElementById('sidebar-avatar');
    const sem = document.getElementById('sidebar-email');
    if (av) av.textContent = initials;
    if (sav) sav.textContent = initials;
    if (sem) sem.textContent = email;
  }
  setupRealtime();
  showPage('dashboard');
}

function setupRealtime() {
  if (!sb) return;
  const pageMap = {
    clients: { page: 'clients', reload: () => loadClients() },
    proposals: { page: 'proposals', reload: () => loadProposals() },
    partners: { page: 'partners', reload: () => loadPartners() },
    invoices: { page: 'finance', reload: () => loadFinance() },
    bills: { page: 'finance', reload: () => loadFinance() },
    payroll_runs: { page: 'finance', reload: () => loadFinance() },
    bir_filings: { page: 'finance', reload: () => loadFinance() },
    documents: { page: 'documents', reload: () => loadDocuments() },
    projects: { page: 'projects', reload: () => loadProjects() },
    impact_entries:       { page: 'impact',  reload: () => loadImpact() },
    events:               { page: 'events',  reload: () => loadEvents() },
    event_registrations:  { page: 'events',  reload: () => loadEvents() },
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
  ch.subscribe();

}

async function handleSignIn() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  if (!email || !pass) {
    errEl.textContent = 'Email and password required.';
    return;
  }
  const { data, error } = await signIn(email, pass);
  if (error) {
    errEl.textContent = error.message;
    return;
  }
  if (!data.user) {
    errEl.textContent = 'Sign in failed. Please try again.';
    return;
  }
  const { data: profile } = await sb
    .from('intern_users')
    .select('role')
    .eq('id', data.user.id)
    .single();
  const role = profile?.role || 'intern';
  if (role !== 'admin') {
    window.location.href = 'intern.html';
    return;
  }
  const name = data.user.user_metadata?.full_name || data.user.user_metadata?.name || '';
  enterApp(data.user.email, name);
}

async function handleSignOut() {
  await signOut();
  location.reload();
}

function showPage(name) {
  toggleHqNav(false);
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  const page = document.getElementById('page-' + name);
  if (page) {
    page.classList.add('active');
    loadPage(name);
  }
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
  const activeNav = document.querySelector(`.nav-item[data-page="${name}"]`);
  if (activeNav) activeNav.classList.add('active');
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  const activeTab = document.querySelector(`.tab[data-page="${name}"]`);
  if (activeTab) activeTab.classList.add('active');
}

function loadPage(name) {
  switch (name) {
    case 'dashboard':
      loadDashboard();
      break;
    case 'clients':
      loadClients();
      break;
    case 'proposals':
      loadProposals();
      break;
    case 'projects':
      loadProjects();
      break;
    case 'partners':
      loadPartners();
      break;
    case 'documents':
      loadDocuments();
      break;
    case 'finance':
      loadFinance();
      break;
    case 'impact':
      loadImpact();
      break;
    case 'events':
      loadEvents();
      break;
    case 'ai':
      initAIAutocomplete();
      break;
  }
}

async function loadDashboard() {
  const [clients, proposals, projects, invoices, bills, partners] = await Promise.all([
    fetchClients(),
    fetchProposals(),
    fetchProjects(),
    fetchInvoices(),
    fetchBills(),
    fetchPartners(),
  ]);
  setClients(clients || []);
  setProposals(proposals || []);
  setProjects(projects || []);
  setInvoices(invoices || []);
  setBills(bills || []);
  setPartners(partners || []);
  renderDashboard();
}

function renderDashboard() {
  const el = id => document.getElementById(id);

  // ── Stat cards ──
  const activeProjects  = _projects.filter(p => p.status === 'Active').length;
  const pipelineValue   = _proposals.filter(p => p.status !== 'Won' && p.status !== 'Lost').reduce((s, p) => s + (p.value || 0), 0);
  const ndaSigned       = _clients.filter(c => c.status === 'NDA Signed').length;
  const totalClients    = _clients.length;

  el('dash-stats').innerHTML = `
    <div class="stat-card"><div class="stat-accent" style="background:var(--green)"></div><div class="stat-label">Active Projects</div><div class="stat-value">${activeProjects}</div><div class="stat-change">of ${_projects.length} total</div></div>
    <div class="stat-card"><div class="stat-accent" style="background:var(--blue)"></div><div class="stat-label">Pipeline Value</div><div class="stat-value" style="font-size:24px">${formatCurrency(pipelineValue)}</div><div class="stat-change">${_proposals.filter(p => p.status !== 'Won' && p.status !== 'Lost').length} open proposals</div></div>
    <div class="stat-card"><div class="stat-accent" style="background:var(--amber)"></div><div class="stat-label">NDAs Signed</div><div class="stat-value">${ndaSigned}</div><div class="stat-change">${_clients.filter(c => c.status === 'Lead').length} still in lead stage</div></div>
    <div class="stat-card"><div class="stat-accent" style="background:var(--forest)"></div><div class="stat-label">Total Clients</div><div class="stat-value">${totalClients}</div><div class="stat-change up">across all brands</div></div>`;

  // ── Pipeline by proposal status ──
  const stageCounts = {};
  _proposals.forEach(p => { stageCounts[p.status] = (stageCounts[p.status] || 0) + 1; });
  const maxStage = Math.max(1, ...Object.values(stageCounts));
  el('dash-pipeline').innerHTML = Object.keys(stageCounts).length
    ? Object.entries(stageCounts).map(([s, n]) => `
        <div class="pipeline-bar">
          <div class="pipeline-label"><span>${escapeHtml(s)}</span><span>${n}</span></div>
          <div class="pipeline-track"><div class="pipeline-fill" style="width:${Math.round(n / maxStage * 100)}%"></div></div>
        </div>`).join('')
    : '<div style="font-size:11px;color:var(--ink-3);padding:8px 0">No proposals yet</div>';

  // ── Activity feed (newest clients + invoices) ──
  const activity = [
    ..._clients.slice(0, 4).map(c => ({ text: `New client — ${c.name}`, time: c.created_at || '', dot: 'blue' })),
    ..._invoices.slice(0, 4).map(i => ({ text: `Invoice ${i.or_num} — ${i.client} · ${i.status}`, time: i.created_at || i.date || '', dot: i.status === 'Paid' ? 'green' : i.status === 'Overdue' ? 'red' : 'blue' })),
    ..._projects.slice(0, 2).map(p => ({ text: `Project — ${p.name} · ${p.status}`, time: p.created_at || '', dot: 'green' })),
  ].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 5);

  el('dash-activity').innerHTML = activity.length
    ? activity.map(a => `
        <div class="activity-item">
          <div class="activity-dot ${a.dot}"></div>
          <div><div class="activity-text">${escapeHtml(a.text)}</div><div class="activity-time">${formatDateShort((a.time || '').slice(0, 10))}</div></div>
        </div>`).join('')
    : '<div style="font-size:11px;color:var(--ink-3);padding:8px 0">No activity yet — add clients and projects to get started</div>';

  // ── Revenue chart (paid invoices, last 6 months) ──
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return { label: d.toLocaleString('en-US', { month: 'short' }), key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` };
  });
  const revByMonth = {};
  _invoices.filter(i => i.status === 'Paid').forEach(i => {
    const k = (i.date || '').slice(0, 7);
    if (k) revByMonth[k] = (revByMonth[k] || 0) + (i.amount || 0);
  });
  const maxRev = Math.max(1, ...months.map(m => revByMonth[m.key] || 0));
  el('dash-chart').innerHTML = months.map(m => {
    const h = Math.max(3, Math.round(((revByMonth[m.key] || 0) / maxRev) * 100));
    return `<div class="bar"><div class="bar-fill" style="height:${h}%"></div></div>`;
  }).join('');
  el('dash-chart-label').textContent = `${months[0].label} — ${months[5].label} ${now.getFullYear()}`;

  // ── Follow-ups due (proposals with upcoming follow-up date) ──
  const today = todayISO();
  const followups = _proposals
    .filter(p => p.followup && p.followup >= today && p.status !== 'Won' && p.status !== 'Lost')
    .sort((a, b) => a.followup.localeCompare(b.followup))
    .slice(0, 4);
  el('dash-followups').innerHTML = followups.length
    ? followups.map(p => `<div>${escapeHtml(p.followup)} — <strong>${escapeHtml(p.client || p.name)}</strong></div>`).join('')
    : '<div style="color:var(--ink-3)">No follow-ups due soon</div>';

  // ── Quick stats ──
  const won   = _proposals.filter(p => p.status === 'Won').length;
  const closed = _proposals.filter(p => p.status === 'Won' || p.status === 'Lost').length;
  const winRate = closed ? Math.round(won / closed * 100) : 0;
  el('dash-quickstats').innerHTML = `
    <div>${_proposals.length} total proposal${_proposals.length !== 1 ? 's' : ''}</div>
    <div>Win rate: <strong>${winRate}%</strong></div>
    <div>${_partners.length} partner${_partners.length !== 1 ? 's' : ''}</div>`;
}

function filterTable(input, tbodyId) {
  const q = input.value.toLowerCase();
  document.querySelectorAll('#' + tbodyId + ' tr').forEach((tr) => {
    tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

// index.html keeps its inline onclick/oninput handlers — every function they
// (or HQ-generated template literals) reference must be a window global.
Object.assign(window, {
  showPage, handleSignIn, handleSignOut, toggleHqNav, filterTable,
  closeModal, saveModal, toast,
  // Clients
  openAddClient, openEditClient, handleDeleteClient, openClientDetail,
  // Proposals
  openAddProposal, openEditProposal, handleDeleteProposal,
  // Partners
  openAddPartner, openEditPartner, handleDeletePartner,
  // Projects
  openAddProject, openEditProject, handleDeleteProject, convertProposalToProject,
  // Finance
  openAddInvoice, openEditInvoice, handleDeleteInvoice,
  openAddBill, openEditBill, handleDeleteBill,
  openAddPayroll, openEditPayroll, handleDeletePayroll,
  openFileBir, showFinanceTab, estimateDeductions,
  // Operations
  filterPartners, handleFileSelect, npGoStep1, npGoStep2, npFinish, downloadNDA,
  saveImpactEntry, openEditImpact, handleDeleteImpact,
  openDocPreview, closeDocPreview, handleDeleteDocument,
  // Events
  loadEvents, openAddEvent, openEditEvent, handleDeleteEvent,
  filterEvents, viewEventRegistrations, backToEvents, copyRegisterUrl,
  updateRegistrationStatus: handleUpdateRegistrationStatus,
  openIssueEventInvoice,
  // AI
  selectTemplate, copyAIOutput, simulateAI,
});

export { showPage };

init();
