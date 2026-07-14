// ─── HQ APP SHELL: auth, routing, realtime, dashboard, window shims ──────────
// Top of the module graph. index.html keeps its inline onclick handlers, so
// every function they reference is re-attached to window at the bottom.
import { sb } from '../../shared/services/supabase';
import { signIn, signOut, getSession } from '../../shared/services/authService.ts';
import { formatCurrency } from '../../shared/utils/formatUtils.ts';
import { formatDateShort, todayISO } from '../../shared/utils/dateUtils.ts';
import { escapeHtml } from '../../shared/utils/helpers.ts';
import { fetchClients } from '../../shared/services/clientService.ts';
import { fetchProposals } from '../../shared/services/proposalService.ts';
import { fetchPartners } from '../../shared/services/partnerService.ts';
import { fetchInvoices, fetchBills } from '../../shared/services/financeService.ts';
import { fetchProjects } from '../../shared/services/projectService.ts';
import {
  _clients, _proposals, _partners, _invoices, _projects,
  setClients, setProposals, setPartners, setInvoices, setBills, setProjects,
} from './state.ts';
import { toast, closeModal, saveModal, toggleHqNav } from './ui.ts';
import {
  loadClients, openAddClient, openEditClient, handleDeleteClient, openClientDetail,
  loadProposals, openAddProposal, openEditProposal, handleDeleteProposal,
} from './crm.ts';
import {
  loadPartners, filterPartners, openAddPartner, openEditPartner, handleDeletePartner,
  loadDocuments, handleFileSelect, openDocPreview, closeDocPreview, handleDeleteDocument,
  loadNDA, npGoStep2, npGoStep1, npFinish, downloadNDA,
  loadImpact, saveImpactEntry, openEditImpact, handleDeleteImpact,
} from './operations.ts';
import {
  loadFinance, showFinanceTab, openFileBir,
  openAddInvoice, openEditInvoice, saveInvoice, handleDeleteInvoice,
  openDuplicateInvoice, printInvoice, archiveInvoice, restoreInvoice,
  toggleArchivedInvoices, openInvoiceFromSOB,
  openPaymentLink, copyPaymentLink,
  openBpiQr, copyBpiText, downloadBpiQr,
  openRecordPayment, saveRecordPayment,
  addInvoiceRow, recalcInvoice, togglePaymentFields,
  openAddBill, openEditBill, handleDeleteBill,
  openAddPayroll, openEditPayroll, handleDeletePayroll,
  estimateDeductions,
  openARProjectSOB, advanceARProjectStage,
  sendInvoiceEmail, printOfficialReceipt, openPaymentHistory,
  toggleActionMenu,
} from './finance.ts';
import { loadProjects, openAddProject, openEditProject, handleDeleteProject, convertProposalToProject, openProjectDetail } from './projects.ts';
import { selectTemplate, copyAIOutput, simulateAI, saveAIOutput, initAIAutocomplete } from './ai.ts';
import {
  loadEvents, openAddEvent, openEditEvent, handleDeleteEvent,
  filterEvents, viewEventRegistrations, backToEvents, copyRegisterUrl,
  handleUpdateRegistrationStatus, openIssueEventInvoice,
} from './events.ts';
import { HQ_ALLOWED_PAGES, isHQRole, isICCRole } from '../../config/roles.ts';
import type { UserRole } from '../../shared/types';
import { loadUsers, approveUser, changeUserRole } from './users.ts';
import {
  openAddSOB, openEditSOB, saveSOB, handleDeleteSOB,
  openDuplicateSOB, archiveSOB, restoreSOB, convertSOBToInvoice,
  toggleArchivedSOBs, addSOBRow, recalcSOB, printSOB, openSOBRecordPayment, openSOBSendEmail,
} from './sob.ts';

const gEl = (id: string) => document.getElementById(id)!;

async function init() {
  const session = await getSession();
  if (session) {
    const { data: profile, error: profileError } = await sb
      .from('intern_users')
      .select('role')
      .eq('id', session.user.id)
      .single();
    if (profileError || !profile) {
      (gEl('login-screen') as HTMLElement).style.display = 'flex';
      gEl('login-error').textContent =
        'Could not verify your account. Please sign in again.';
      return;
    }
    const role = profile.role as UserRole;
    if (role === 'pending') {
      window.location.href = 'login.html';
      return;
    }
    if (isICCRole(role)) {
      window.location.href = 'intern.html';
      return;
    }
    if (!isHQRole(role)) {
      window.location.href = 'login.html';
      return;
    }
    const name = session.user.user_metadata?.full_name || session.user.user_metadata?.name || '';
    enterApp(session.user.email, name, role);
  } else {
    (gEl('login-screen') as HTMLElement).style.display = 'flex';
  }
}

function applyHQRoleAccess(role: UserRole) {
  if (role === 'admin') return;
  const allowed = HQ_ALLOWED_PAGES[role] ?? [];
  document.querySelectorAll<HTMLElement>('.nav-item[data-page]').forEach(el => {
    el.style.display = allowed.includes(el.dataset['page'] ?? '') ? '' : 'none';
  });
  document.querySelectorAll<HTMLElement>('.tab[data-page]').forEach(el => {
    el.style.display = allowed.includes(el.dataset['page'] ?? '') ? '' : 'none';
  });
  // Only admin can switch to the Intern portal
  const switchBtn = document.getElementById('nav-switch-intern');
  if (switchBtn) switchBtn.style.display = 'none';
  if (role === 'external_accountant') {
    document.body.classList.add('hq-readonly');
  }
}

function enterApp(email: string | undefined, name: string, role: UserRole = 'admin') {
  (gEl('login-screen') as HTMLElement).style.display = 'none';
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  gEl('dashboard-greeting').textContent = name
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
  applyHQRoleAccess(role);
  showPage('dashboard');
}

function setupRealtime() {
  if (!sb) return;
  const pageMap: Record<string, { page: string; reload: () => void }> = {
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
    events:               { page: 'events',    reload: () => loadEvents() },
    event_registrations:  { page: 'events',    reload: () => loadEvents() },
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
  const email = (gEl('login-email') as HTMLInputElement).value.trim();
  const pass  = (gEl('login-pass') as HTMLInputElement).value;
  const errEl = gEl('login-error');
  errEl.textContent = '';
  if (!email || !pass) {
    errEl.textContent = 'Email and password required.';
    return;
  }
  const { data, error } = await signIn(email, pass);
  if (error) {
    errEl.textContent = (error as { message: string }).message;
    return;
  }
  if (!data || !data.user) {
    errEl.textContent = 'Sign in failed. Please try again.';
    return;
  }
  const { data: profile, error: profileError } = await sb
    .from('intern_users')
    .select('role')
    .eq('id', data.user.id)
    .single();
  if (profileError || !profile) {
    errEl.textContent = 'Could not load your account. Please try again or contact support.';
    return;
  }
  const role = profile.role as UserRole;
  if (role === 'pending') {
    errEl.textContent = 'Your account is pending approval. Jenn will assign your access shortly.';
    return;
  }
  if (isICCRole(role)) {
    window.location.href = 'intern.html';
    return;
  }
  if (!isHQRole(role)) {
    errEl.textContent = 'Your account does not have HQ access. Please use the correct portal.';
    return;
  }
  const name = data.user.user_metadata?.full_name || data.user.user_metadata?.name || '';
  enterApp(data.user.email, name, role);
}

async function handleSignOut() {
  await signOut();
  window.location.href = 'login.html';
}

function showPage(name: string) {
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

function loadPage(name: string) {
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
    case 'new-project':
      loadNDA();
      break;
    case 'ai':
      initAIAutocomplete();
      break;
    case 'users':
      loadUsers();
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
  const el = (id: string) => document.getElementById(id)!;

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
  const stageCounts: Record<string, number> = {};
  _proposals.forEach(p => { stageCounts[p.status] = (stageCounts[p.status] || 0) + 1; });
  const maxStage = Math.max(1, ...Object.values(stageCounts));
  el('dash-pipeline').innerHTML = Object.keys(stageCounts).length
    ? Object.entries(stageCounts).map(([s, n]) => `
        <div class="pipeline-bar">
          <div class="pipeline-label"><span>${escapeHtml(s)}</span><span>${n}</span></div>
          <div class="pipeline-track"><div class="pipeline-fill" style="width:${Math.round(n / maxStage * 100)}%"></div></div>
        </div>`).join('')
    : '<div style="font-size:11px;color:var(--ink-3);padding:8px 0">No proposals yet</div>';

  // ── Activity feed (newest clients + invoices + projects) ──
  const activity = [
    ..._clients.slice(0, 4).map(c => ({ text: `New client — ${c.name}`, time: c.created_at || '', dot: 'blue', action: `openClientDetail(${c.id})` })),
    ..._invoices.slice(0, 4).map(i => ({ text: `Invoice ${i.or_num} — ${i.client} · ${i.status}`, time: i.created_at || i.date || '', dot: i.status === 'Paid' ? 'green' : i.status === 'Overdue' ? 'red' : 'blue', action: `showPage('finance')` })),
    ..._projects.slice(0, 2).map(p => ({ text: `Project — ${p.name} · ${p.status}`, time: p.created_at || '', dot: 'green', action: `openProjectDetail(${p.id})` })),
  ].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 5);

  el('dash-activity').innerHTML = activity.length
    ? activity.map(a => `
        <div class="activity-item" onclick="${a.action}" style="cursor:pointer" onmouseenter="this.style.background='var(--ink-5)'" onmouseleave="this.style.background=''">
          <div class="activity-dot ${a.dot}"></div>
          <div><div class="activity-text">${escapeHtml(a.text)}</div><div class="activity-time">${formatDateShort((a.time || '').slice(0, 10))}</div></div>
          <div style="color:var(--ink-3);font-size:10px;margin-left:auto;padding-left:8px">→</div>
        </div>`).join('')
    : '<div style="font-size:11px;color:var(--ink-3);padding:8px 0">No activity yet — add clients and projects to get started</div>';

  // ── Revenue chart (paid invoices, last 6 months) ──
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return { label: d.toLocaleString('en-US', { month: 'short' }), key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` };
  });
  const revByMonth: Record<string, number> = {};
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
    .sort((a, b) => (a.followup ?? '').localeCompare(b.followup ?? ''))
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

function filterTable(input: HTMLInputElement, tbodyId: string) {
  const q = input.value.toLowerCase();
  document.querySelectorAll('#' + tbodyId + ' tr').forEach((tr) => {
    (tr as HTMLElement).style.display = (tr.textContent || '').toLowerCase().includes(q) ? '' : 'none';
  });
}

// index.html keeps its inline onclick/oninput handlers — every function they
// (or HQ-generated template literals) reference must be a window global.
declare global {
  interface Window {
    showPage: typeof showPage; handleSignIn: typeof handleSignIn; handleSignOut: typeof handleSignOut;
    toggleHqNav: typeof toggleHqNav; filterTable: typeof filterTable;
    closeModal: typeof closeModal; saveModal: typeof saveModal; toast: typeof toast;
    openAddClient: typeof openAddClient; openEditClient: typeof openEditClient;
    handleDeleteClient: typeof handleDeleteClient; openClientDetail: typeof openClientDetail;
    openAddProposal: typeof openAddProposal; openEditProposal: typeof openEditProposal;
    handleDeleteProposal: typeof handleDeleteProposal;
    openAddProject: typeof openAddProject; openEditProject: typeof openEditProject;
    handleDeleteProject: typeof handleDeleteProject; convertProposalToProject: typeof convertProposalToProject;
    openProjectDetail: typeof openProjectDetail;
    openAddInvoice: typeof openAddInvoice; openEditInvoice: typeof openEditInvoice;
    saveInvoice: typeof saveInvoice; handleDeleteInvoice: typeof handleDeleteInvoice;
    openDuplicateInvoice: typeof openDuplicateInvoice; printInvoice: typeof printInvoice;
    archiveInvoice: typeof archiveInvoice; restoreInvoice: typeof restoreInvoice;
    toggleArchivedInvoices: typeof toggleArchivedInvoices; openInvoiceFromSOB: typeof openInvoiceFromSOB;
    openAddSOB: typeof openAddSOB; openEditSOB: typeof openEditSOB; saveSOB: typeof saveSOB;
    handleDeleteSOB: typeof handleDeleteSOB; openDuplicateSOB: typeof openDuplicateSOB;
    archiveSOB: typeof archiveSOB; restoreSOB: typeof restoreSOB;
    convertSOBToInvoice: typeof convertSOBToInvoice; toggleArchivedSOBs: typeof toggleArchivedSOBs;
    addSOBRow: typeof addSOBRow; recalcSOB: typeof recalcSOB; printSOB: typeof printSOB;
    openSOBRecordPayment: typeof openSOBRecordPayment; openSOBSendEmail: typeof openSOBSendEmail;
    openPaymentLink: typeof openPaymentLink; copyPaymentLink: typeof copyPaymentLink;
    openBpiQr: typeof openBpiQr; copyBpiText: typeof copyBpiText; downloadBpiQr: typeof downloadBpiQr;
    openRecordPayment: typeof openRecordPayment; saveRecordPayment: typeof saveRecordPayment;
    addInvoiceRow: typeof addInvoiceRow; recalcInvoice: typeof recalcInvoice;
    togglePaymentFields: typeof togglePaymentFields;
    openARProjectSOB: typeof openARProjectSOB; advanceARProjectStage: typeof advanceARProjectStage;
    sendInvoiceEmail: typeof sendInvoiceEmail; printOfficialReceipt: typeof printOfficialReceipt;
    openPaymentHistory: typeof openPaymentHistory; toggleActionMenu: typeof toggleActionMenu;
    openAddBill: typeof openAddBill;
    openEditBill: typeof openEditBill; handleDeleteBill: typeof handleDeleteBill;
    openAddPayroll: typeof openAddPayroll; openEditPayroll: typeof openEditPayroll;
    handleDeletePayroll: typeof handleDeletePayroll; openFileBir: typeof openFileBir;
    showFinanceTab: typeof showFinanceTab; estimateDeductions: typeof estimateDeductions;
    filterPartners: typeof filterPartners; handleFileSelect: typeof handleFileSelect;
    npGoStep1: typeof npGoStep1; npGoStep2: typeof npGoStep2; npFinish: typeof npFinish;
    downloadNDA: typeof downloadNDA; saveImpactEntry: typeof saveImpactEntry;
    openEditImpact: typeof openEditImpact; handleDeleteImpact: typeof handleDeleteImpact;
    openDocPreview: typeof openDocPreview; closeDocPreview: typeof closeDocPreview;
    handleDeleteDocument: typeof handleDeleteDocument;
    openAddEvent: typeof openAddEvent; openEditEvent: typeof openEditEvent;
    handleDeleteEvent: typeof handleDeleteEvent; loadEvents: typeof loadEvents;
    filterEvents: typeof filterEvents; viewEventRegistrations: typeof viewEventRegistrations;
    backToEvents: typeof backToEvents; copyRegisterUrl: typeof copyRegisterUrl;
    updateRegistrationStatus: typeof handleUpdateRegistrationStatus;
    openIssueEventInvoice: typeof openIssueEventInvoice;
    selectTemplate: typeof selectTemplate; copyAIOutput: typeof copyAIOutput;
    simulateAI: typeof simulateAI; saveAIOutput: typeof saveAIOutput;
    approveUser: typeof approveUser; changeUserRole: typeof changeUserRole;
  }
}

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
  openAddProject, openEditProject, handleDeleteProject, convertProposalToProject, openProjectDetail,
  // Finance
  openAddInvoice, openEditInvoice, saveInvoice, handleDeleteInvoice,
  openDuplicateInvoice, printInvoice, archiveInvoice, restoreInvoice,
  toggleArchivedInvoices, openInvoiceFromSOB,
  openPaymentLink, copyPaymentLink,
  openBpiQr, copyBpiText, downloadBpiQr,
  openRecordPayment, saveRecordPayment,
  addInvoiceRow, recalcInvoice, togglePaymentFields,
  openARProjectSOB, advanceARProjectStage,
  sendInvoiceEmail, printOfficialReceipt, openPaymentHistory,
  toggleActionMenu,
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
  selectTemplate, copyAIOutput, simulateAI, saveAIOutput,
  // SOB (Statement of Billing)
  openAddSOB, openEditSOB, saveSOB, handleDeleteSOB,
  openDuplicateSOB, archiveSOB, restoreSOB, convertSOBToInvoice,
  toggleArchivedSOBs, addSOBRow, recalcSOB, printSOB, openSOBRecordPayment, openSOBSendEmail,
  // Users (admin)
  approveUser, changeUserRole,
});

export { showPage };

init();
