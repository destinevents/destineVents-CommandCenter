// ─── GLOBAL STATE ────────────────────────────────────────────────────────────
let currentUser = {};
let activePage = 'dashboard';
let sheetFilter = 'all';
let taskFilter = 'all';
let sidebarOpen = true;
let pendingRejectId = null;

let liveUsers = [];
let liveTasks = [];
let liveTimesheets = [];

// ─── UTILITY FUNCTIONS ───────────────────────────────────────────────────────
function user(id) {
  return liveUsers.find((u) => u.id === id) || {};
}

function myTasks() {
  return liveTasks;
}

function mySheets() {
  return liveTimesheets;
}

function pendingApprovals() {
  return liveTimesheets.filter((t) => t.status === 'pending');
}

function toast(msg) {
  showToast(msg, '', 2400);
}

function handleError(context, error) {
  logger.error(context, error?.message || 'Unknown error', error);
  toast(`Something went wrong: ${error?.message || 'Unknown error'}. Try refreshing.`);
}

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  // Closing the task modal by ANY path (Cancel, overlay, save) must clear
  // edit mode — a stale editingTaskId would make a later submit update the
  // wrong task. editingTaskId lives in icc/tasks.js.
  if (id === 'modal-add-task' && typeof editingTaskId !== 'undefined' && editingTaskId) {
    editingTaskId = null;
    setTaskModalMode(false);
  }
}

// ─── UI HELPERS ──────────────────────────────────────────────────────────────
function applyRoleVisibility() {
  const isAdmin = currentUser.role === 'admin';
  const isSup = currentUser.role === 'supervisor' || isAdmin;
  const isIntern = currentUser.role === 'intern';
  document
    .querySelectorAll('.admin-only')
    .forEach((el) => (el.style.display = isAdmin ? '' : 'none'));
  document
    .querySelectorAll('.supervisor-only')
    .forEach((el) => (el.style.display = isSup ? '' : 'none'));
  document
    .querySelectorAll('.intern-only')
    .forEach((el) => (el.style.display = isIntern ? '' : 'none'));
}

function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  const sidebarEl = document.getElementById('sidebar');
  sidebarEl.classList.toggle('collapsed', !sidebarOpen);
  document.querySelector('.sb-collapse').textContent = sidebarOpen ? '◀' : '▶';
}

// Phone-width off-canvas nav (hamburger in the topbar, backdrop behind)
function toggleMobileNav(open) {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const next = open ?? !sidebar.classList.contains('mobile-open');
  sidebar.classList.toggle('mobile-open', next);
  backdrop.classList.toggle('show', next);
  // The drawer always shows full labels; desktop collapse state doesn't apply
  if (next) sidebar.classList.remove('collapsed');
}

function updateBadges() {
  const count = pendingApprovals().length;
  document.getElementById('approval-badge').textContent = count;
  document.getElementById('approval-badge').style.display = count > 0 ? 'inline' : 'none';
  const nb = document.getElementById('notif-btn');
  if (nb) {
    nb.style.display = currentUser.role !== 'intern' && count > 0 ? 'flex' : 'none';
  }
  document.getElementById('notif-count').textContent = count;
}

// ─── DATA LOADING ────────────────────────────────────────────────────────────
async function loadLiveUsers() {
  const result = await fetchUsers();
  if (result) liveUsers = result;
}

async function loadLiveTasks() {
  const result = await fetchTasks(currentUser.role, currentUser.id);
  if (result) liveTasks = result;
}

async function loadLiveTimesheets() {
  const result = await fetchTimesheets(currentUser.role, currentUser.id);
  if (result) liveTimesheets = result;
}

// ─── PAGE ROUTING ────────────────────────────────────────────────────────────
const PAGE_DATA = {
  dashboard: ['tasks', 'timesheets'],
  tasks: ['tasks'],
  timesheets: ['timesheets'],
  outputs: ['tasks'],
  approvals: ['timesheets'],
  interns: ['users', 'tasks', 'timesheets'],
  reports: ['users', 'tasks', 'timesheets'],
  audit: ['users'],
  account: [],
};

async function goPage(page) {
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.getElementById('page-' + page)?.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.page === page);
    const pip = b.querySelector('.pip');
    if (pip) pip.style.display = b.classList.contains('active') ? 'block' : 'none';
  });
  activePage = page;
  const titles = {
    dashboard: 'Dashboard',
    tasks: 'Tasks',
    timesheets: 'Timesheets',
    outputs: 'Output Portfolio',
    approvals: 'Approvals',
    interns: 'Interns',
    reports: 'Reports',
    audit: 'Audit Log',
    account: 'Account Settings',
  };
  document.getElementById('topbar-title').textContent = titles[page] || page;
  await renderPage(page);
}

async function renderPage(page) {
  if (!currentUser.id) return;

  const map = {
    dashboard: renderDashboard,
    tasks: renderTasks,
    timesheets: renderTimesheets,
    outputs: renderOutputs,
    approvals: renderApprovals,
    interns: renderInterns,
    reports: renderReports,
    audit: renderAuditLog,
    account: renderAccount,
  };

  const needs = PAGE_DATA[page] ?? [];
  try {
    await Promise.all([
      needs.includes('tasks') ? loadLiveTasks() : Promise.resolve(),
      needs.includes('timesheets') ? loadLiveTimesheets() : Promise.resolve(),
      needs.includes('users') ? loadLiveUsers() : Promise.resolve(),
    ]);
    const fn = map[page];
    if (fn) await fn();
  } catch (err) {
    handleError('renderPage:' + page, err);
  }
}

// ─── REALTIME ────────────────────────────────────────────────────────────────
// User-facing notifications are rows in intern_notifications, created by DB
// triggers (database/schema/notifications.sql) — the INSERT subscription
// below toasts them and feeds the bell via handleIncomingNotification.
// Data events are processed strictly in arrival order so reloads and
// re-renders never interleave.
let realtimeChain = Promise.resolve();
function queueRealtime(handler) {
  realtimeChain = realtimeChain
    .then(handler)
    .catch((err) => logger.error('realtime', err?.message || 'handler failed', err));
}

function setupRealtime() {
  sb.channel('intern-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'intern_tasks' }, () => queueRealtime(async () => {
      await loadLiveTasks();
      await updateBadges();
      if (activePage === 'tasks' || activePage === 'dashboard' || activePage === 'outputs') {
        await renderPage(activePage);
      }
    }))
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'intern_timesheets' },
      () => queueRealtime(async () => {
        await loadLiveTimesheets();
        await updateBadges();
        if (
          activePage === 'timesheets' ||
          activePage === 'dashboard' ||
          activePage === 'approvals'
        ) {
          await renderPage(activePage);
        }
      })
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'intern_users' },
      async (payload) => {
        await loadLiveUsers();
        if (payload.new?.id === currentUser?.id) {
          const freshUser = await getCurrentUser();
          if (freshUser) {
            currentUser.role = freshUser.role;
            currentUser.name = freshUser.name;
            document.getElementById('topbar-role').textContent = freshUser.role;
            document.getElementById('sb-role').textContent = freshUser.role;
            applyRoleVisibility();
          }
        }
        if (activePage === 'interns' || activePage === 'reports') {
          await renderPage(activePage);
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'intern_notifications',
        filter: `user_id=eq.${currentUser.id}`,
      },
      (payload) => handleIncomingNotification(payload)
    )
    .subscribe();
}

// ─── EVENT DELEGATION ────────────────────────────────────────────────────────
document.querySelectorAll('.modal-overlay').forEach((m) => {
  m.addEventListener('click', (e) => {
    if (e.target === m) closeModal(m.id);
  });
});

document.getElementById('sidebar-nav').addEventListener('click', async (e) => {
  const btn = e.target.closest('.nav-btn');
  if (btn && btn.dataset.page) {
    toggleMobileNav(false);
    await goPage(btn.dataset.page);
  }
});

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'signout') {
    e.preventDefault();
    await handleSignOut();
    return;
  }
  if (a === 'toggle-sidebar') {
    toggleSidebar();
    return;
  }
  if (a === 'toggle-mobile-nav') {
    toggleMobileNav();
    return;
  }
  if (a === 'go-page') {
    await goPage(el.dataset.page);
    return;
  }
  if (a === 'open-modal') {
    openModal(el.dataset.modal);
    return;
  }
  if (a === 'close-modal') {
    closeModal(el.dataset.modal);
    return;
  }
  if (a === 'create-task') {
    await handleCreateTask();
    return;
  }
  if (a === 'new-task') {
    openCreateTask();
    return;
  }
  if (a === 'edit-task') {
    openEditTask(el.dataset.id);
    return;
  }
  if (a === 'delete-task') {
    await handleDeleteTask(el.dataset.id);
    return;
  }
  if (a === 'log-hours') {
    await logHours();
    return;
  }
  if (a === 'confirm-reject') {
    confirmReject();
    return;
  }
  if (a === 'set-sheet-filter') {
    setSheetFilter(el.dataset.filter);
    return;
  }
  if (a === 'set-task-filter') {
    await setTaskFilter(el.dataset.filter);
    return;
  }
  if (a === 'open-task') {
    openTaskDetail(el.dataset.id);
    return;
  }
  if (a === 'task-action') {
    taskAction(el.dataset.id, el.dataset.taskAction);
    return;
  }
  if (a === 'approve-sheet') {
    await approveSheet(el.dataset.id);
    return;
  }
  if (a === 'reject-sheet') {
    rejectSheet(el.dataset.id);
    return;
  }
  if (a === 'delete-sheet') {
    await deleteSheet(el.dataset.id);
    return;
  }
  if (a === 'export-excel') {
    exportExcel(el.dataset.id);
    return;
  }
  if (a === 'export-pdf') {
    exportPDF(el.dataset.id);
    return;
  }
  if (a === 'switch-to-hq') {
    window.location.href = 'index.html';
    return;
  }
  if (a === 'toggle-notif-center') {
    toggleNotifCenter();
    return;
  }
  if (a === 'open-notification') {
    await openNotification(el.dataset.id, el.dataset.page);
    return;
  }
  if (a === 'notif-mark-all') {
    markAllNotificationsRead();
    return;
  }
  if (a === 'sheet-load-more') {
    loadMoreSheets();
    return;
  }
  if (a === 'task-load-more') {
    loadMoreTasks();
    return;
  }
  if (a === 'output-load-more') {
    loadMoreOutputs();
    return;
  }
});

// ─── INITIALIZATION ───────────────────────────────────────────────────────────
async function handleSignOut() {
  await signOut();
  window.location.href = 'login.html';
}

async function init() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      window.location.href = 'login.html';
      return;
    }

    if (!user.name) {
      document.getElementById('page-dashboard').innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh;text-align:center;padding:40px">
          <div style="font-size:48px;margin-bottom:16px">👋</div>
          <h2 style="margin-bottom:8px">Welcome to Intern Command Center</h2>
          <p style="color:var(--muted);margin-bottom:24px;max-width:400px">
            Your profile hasn't been set up yet. Please contact your supervisor or administrator to create your account.
          </p>
          <button class="btn-primary" data-action="signout" style="padding:10px 24px">Sign Out</button>
        </div>`;
      return;
    }

    currentUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar || user.name.slice(0, 2).toUpperCase(),
      program: user.program,
      school: user.school,
    };

    document.getElementById('topbar-name').textContent = user.name;
    document.getElementById('topbar-role').textContent = user.role;
    document.getElementById('topbar-avatar').textContent = currentUser.avatar;
    document.getElementById('topbar-date').textContent = new Date().toLocaleDateString('en-PH', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    document.getElementById('sb-avatar').textContent = currentUser.avatar;
    document.getElementById('sb-name').textContent = currentUser.name;
    document.getElementById('sb-role').textContent = currentUser.role;

    applyRoleVisibility();
    ['task-type-filter', 'output-type-filter', 'nt-outtype'].forEach(populateOutputTypeSelect);
    await loadLiveUsers();
    await loadLiveTasks();
    await loadLiveTimesheets();
    await loadNotifications();
    await populateAddTaskModal();
    await updateBadges();
    await renderPage('dashboard');
    setupRealtime();
  } catch (err) {
    handleError('init', err);
    window.location.href = 'login.html';
  }
}

init();
