// @ts-nocheck
// ─── ICC APP SHELL: routing, event delegation, realtime, init ────────────────
// Top of the module graph — imports every page module. Page modules may import
// { goPage, renderPage } back from here, but only call them inside handlers
// (never at top level), which keeps the circular edges TDZ-safe.
import { logger } from '../../shared/utils/logger.ts';
import { populateOutputTypeSelect } from '../../shared/utils/helpers.ts';
import { sb } from '../../shared/services/supabase';
import { getCurrentUser, signOut } from '../../shared/services/authService.ts';
import {
  currentUser, setCurrentUser, activePage, setActivePage,
} from './state.ts';
import {
  handleError, openModal, closeModal,
  applyRoleVisibility, toggleSidebar, toggleMobileNav, updateBadges,
} from './ui.ts';
import { loadLiveUsers, loadLiveTasks, loadLiveTimesheets } from './data.ts';
import { renderDashboard } from './dashboard.ts';
import {
  renderTasks, setTaskFilter, openTaskDetail, handleDeleteTask, taskAction,
  openCreateTask, openEditTask, populateAddTaskModal, handleCreateTask, taskPager,
} from './tasks.ts';
import {
  renderTimesheets, openLogHours, setSheetFilter, exportTimesheetCSV,
  approveSheet, rejectSheet, confirmReject, deleteSheet, logHours, sheetPager,
} from './timesheets.ts';
import { renderOutputs, outputPager } from './outputs.ts';
import {
  renderApprovals, renderInterns, renderReports, renderAuditLog,
  exportExcel, exportPDF, completeIntern, reopenIntern, setInternTab,
} from './admin.ts';
import { renderAccount } from './account.ts';
import { renderCalendar, calPrev, calNext, calGoToStart, calGoToToday } from './calendar.ts';
import {
  loadNotifications, toggleNotifCenter, openNotification,
  markAllNotificationsRead, handleIncomingNotification,
} from './notifications.ts';
import { isHQRole, isPending } from '../../config/roles.ts';

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
  calendar: ['timesheets', 'tasks'],
};

export async function goPage(page) {
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.getElementById('page-' + page)?.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.page === page);
    const pip = b.querySelector('.pip');
    if (pip) pip.style.display = b.classList.contains('active') ? 'block' : 'none';
  });
  setActivePage(page);
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
    calendar: 'Calendar',
  };
  document.getElementById('topbar-title').textContent = titles[page] || page;
  await renderPage(page);
}

export async function renderPage(page) {
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
    calendar: renderCalendar,
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
// re-renders never interleave — and bursts COALESCE: while a refresh of the
// same kind is queued but not yet started, further events of that kind are
// dropped (the queued refresh fetches their data anyway). Events arriving
// mid-refresh queue exactly one more round.
let realtimeChain = Promise.resolve();
const realtimeQueued = {};
function queueRealtime(kind, handler) {
  if (realtimeQueued[kind]) return;
  realtimeQueued[kind] = true;
  realtimeChain = realtimeChain
    .then(() => {
      realtimeQueued[kind] = false;
      return handler();
    })
    .catch((err) => logger.error('realtime', err?.message || 'handler failed', err));
}

function setupRealtime() {
  sb.channel('intern-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'intern_tasks' }, () => queueRealtime('tasks', async () => {
      await loadLiveTasks();
      await updateBadges();
      if (activePage === 'tasks' || activePage === 'dashboard' || activePage === 'outputs') {
        await renderPage(activePage);
      }
    }))
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'intern_timesheets' },
      () => queueRealtime('timesheets', async () => {
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
      (payload) => queueRealtime('users', async () => {
        await loadLiveUsers();
        if (payload.new?.id === currentUser?.id) {
          const freshUser = await getCurrentUser();
          if (freshUser) {
            currentUser.role = freshUser.role;
            currentUser.name = freshUser.name;
            currentUser.required_hours = freshUser.required_hours;
            document.getElementById('topbar-role').textContent = freshUser.role;
            document.getElementById('sb-role').textContent = freshUser.role;
            applyRoleVisibility();
          }
        }
        if (activePage === 'interns' || activePage === 'reports') {
          await renderPage(activePage);
        }
      })
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
  if (a === 'log-hours-open') {
    openLogHours();
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
  if (a === 'export-my-csv') {
    exportTimesheetCSV();
    return;
  }
  if (a === 'complete-intern') {
    await completeIntern(el.dataset.id);
    return;
  }
  if (a === 'reopen-intern') {
    await reopenIntern(el.dataset.id);
    return;
  }
  if (a === 'intern-tab-active') {
    setInternTab(false);
    return;
  }
  if (a === 'intern-tab-completed') {
    setInternTab(true);
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
    sheetPager.loadMore();
    return;
  }
  if (a === 'task-load-more') {
    taskPager.loadMore();
    return;
  }
  if (a === 'output-load-more') {
    outputPager.loadMore();
    return;
  }
  if (a === 'cal-prev') { calPrev(); return; }
  if (a === 'cal-next') { calNext(); return; }
  if (a === 'cal-start') { calGoToStart(); return; }
  if (a === 'cal-today') { calGoToToday(); return; }
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

    if (isPending(user.role)) {
      window.location.href = 'login.html';
      return;
    }
    // Admin can enter both portals; other HQ-only roles cannot access ICC
    if (user.role !== 'admin' && isHQRole(user.role)) {
      window.location.href = 'index.html';
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

    setCurrentUser({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar || user.name.slice(0, 2).toUpperCase(),
      program: user.program,
      school: user.school,
      required_hours: user.required_hours,
    });

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
    // Independent fetches — load in parallel; populateAddTaskModal needs liveUsers
    await Promise.all([loadLiveUsers(), loadLiveTasks(), loadLiveTimesheets(), loadNotifications()]);
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
