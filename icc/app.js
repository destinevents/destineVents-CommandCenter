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
// Compare the incoming row against the not-yet-reloaded cache to tell interns
// what changed. Must run BEFORE loadLiveTasks/loadLiveTimesheets overwrite it.
function notifyTaskChange(payload) {
  const row = payload.new;
  if (currentUser.role !== 'intern' || !row || row.assigned_to !== currentUser.id) return;
  if (payload.eventType === 'INSERT') {
    showToast(`📋 New task assigned to you: “${row.title}”`, '', 6000);
    return;
  }
  if (payload.eventType !== 'UPDATE') return;
  const prev = liveTasks.find((t) => t.id === row.id);
  if (!prev) return;
  if (prev.status !== row.status) {
    // Status moves the intern makes themselves aren't news; a review is
    if (row.status === 'reviewed') showToast(`🎉 Your task “${row.title}” was reviewed!`, '', 6000);
  } else if (
    prev.title !== row.title ||
    prev.description !== row.description ||
    prev.due_date !== row.due_date ||
    prev.priority !== row.priority
  ) {
    showToast(`✏️ Task updated: “${row.title}”`, '', 6000);
  }
}

function notifySheetChange(payload) {
  const row = payload.new;
  if (currentUser.role !== 'intern' || !row || row.intern_id !== currentUser.id) return;
  if (payload.eventType !== 'UPDATE') return;
  const prev = liveTimesheets.find((s) => s.id === row.id);
  if (!prev || prev.status === row.status) return;
  if (row.status === 'approved') {
    showToast(`✅ Your ${row.hours}h entry for ${row.date} was approved!`, '', 6000);
  } else if (row.status === 'rejected') {
    showToast(
      `❌ Your entry for ${row.date} was rejected${row.rejection_reason ? ': ' + row.rejection_reason : '.'}`,
      '',
      8000
    );
  }
}

function setupRealtime() {
  sb.channel('intern-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'intern_tasks' }, async (payload) => {
      notifyTaskChange(payload);
      await loadLiveTasks();
      await updateBadges();
      if (activePage === 'tasks' || activePage === 'dashboard' || activePage === 'outputs') {
        await renderPage(activePage);
      }
    })
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'intern_timesheets' },
      async (payload) => {
        notifySheetChange(payload);
        await loadLiveTimesheets();
        await updateBadges();
        if (
          activePage === 'timesheets' ||
          activePage === 'dashboard' ||
          activePage === 'approvals'
        ) {
          await renderPage(activePage);
        }
      }
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
    .subscribe();
}

// ─── EVENT DELEGATION ────────────────────────────────────────────────────────
document.querySelectorAll('.modal-overlay').forEach((m) => {
  m.addEventListener('click', (e) => {
    if (e.target === m) m.classList.remove('open');
  });
});

document.getElementById('sidebar-nav').addEventListener('click', async (e) => {
  const btn = e.target.closest('.nav-btn');
  if (btn && btn.dataset.page) await goPage(btn.dataset.page);
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
    await loadLiveUsers();
    await loadLiveTasks();
    await loadLiveTimesheets();
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
