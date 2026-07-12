// ─── ICC UI PRIMITIVES (near-leaf: imports state + shared only) ──────────────
// Toast/modal/sidebar/badge helpers used by every page module. Lives below
// app.js in the import graph so page modules can use these at top level
// without hitting TDZ on the circular app.js edge.
import { showToast } from '../../shared/components/toast.ts';
import { logger } from '../../shared/utils/logger.ts';
import { todayISO } from '../../shared/utils/dateUtils.ts';
import { currentUser, liveTimesheets, pendingApprovals } from './state.ts';

export function toast(msg: string): void {
  showToast(msg, '', 2400);
}

export function handleError(context: string, error: unknown): void {
  const msg = (error as Error)?.message || 'Unknown error';
  logger.error(context, msg, error);
  toast(`Something went wrong: ${msg}. Try refreshing.`);
}

export function openModal(id: string): void {
  const overlay = document.getElementById(id)!;
  overlay.classList.remove('closing');
  overlay.classList.add('open');
}

// Per-modal cleanup run on EVERY close path (Cancel, overlay, save).
// Modules register their own hook (e.g. icc/tasks.ts clears edit mode)
// instead of closeModal reaching into other files' state.
export const MODAL_CLOSE_HOOKS: Record<string, (() => void) | undefined> = {};

export function closeModal(id: string, onClose?: () => void): void {
  const overlay = document.getElementById(id);
  if (!overlay || overlay.classList.contains('closing')) return;
  overlay.classList.add('closing');
  setTimeout(() => {
    overlay.classList.remove('open', 'closing');
    MODAL_CLOSE_HOOKS[id]?.();
    onClose?.();
  }, 180);
}

// ─── UI HELPERS ──────────────────────────────────────────────────────────────
export function applyRoleVisibility() {
  const isAdmin = currentUser.role === 'admin';
  const isSup = currentUser.role === 'supervisor' || isAdmin;
  const isIntern = currentUser.role === 'intern';
  document
    .querySelectorAll<HTMLElement>('.admin-only')
    .forEach((el) => (el.style.display = isAdmin ? '' : 'none'));
  document
    .querySelectorAll<HTMLElement>('.supervisor-only')
    .forEach((el) => (el.style.display = isSup ? '' : 'none'));
  document
    .querySelectorAll<HTMLElement>('.intern-only')
    .forEach((el) => (el.style.display = isIntern ? '' : 'none'));
}

let sidebarOpen = true;

export function toggleSidebar(): void {
  sidebarOpen = !sidebarOpen;
  const sidebarEl = document.getElementById('sidebar')!;
  sidebarEl.classList.toggle('collapsed', !sidebarOpen);
  (document.querySelector('.sb-collapse') as HTMLElement).textContent = sidebarOpen ? '◀' : '▶';
}

// Phone-width off-canvas nav (hamburger in the topbar, backdrop behind)
export function toggleMobileNav(open?: boolean): void {
  const sidebar = document.getElementById('sidebar')!;
  const backdrop = document.getElementById('sidebar-backdrop')!;
  const next = open ?? !sidebar.classList.contains('mobile-open');
  sidebar.classList.toggle('mobile-open', next);
  backdrop.classList.toggle('show', next);
  // The drawer always shows full labels. Clear desktop collapse via
  // toggleSidebar's own state so sidebarOpen and the ◀/▶ arrow stay in sync
  // when the user returns to desktop width.
  if (next && !sidebarOpen) toggleSidebar();
}

export function updateBadges(): void {
  const count = pendingApprovals().length;
  document.getElementById('approval-badge')!.textContent = String(count);
  document.getElementById('approval-badge')!.style.display = count > 0 ? 'inline' : 'none';
  const nb = document.getElementById('notif-btn');
  if (nb) {
    nb.style.display = currentUser.role !== 'intern' && count > 0 ? 'flex' : 'none';
  }
  document.getElementById('notif-count')!.textContent = String(count);
  updateTodayHours();
}

export function updateTodayHours() {
  const el = document.getElementById('sb-today-hours');
  const labelEl = document.getElementById('sb-today-label');
  if (!el) return;
  const today = todayISO();
  const todayTotal = liveTimesheets
    .filter(t => t.date === today)
    .reduce((s, t) => s + t.hours, 0);
  if (todayTotal > 0) {
    el.textContent = todayTotal + 'h';
    if (labelEl) labelEl.textContent = 'TODAY';
  } else {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yISO = yesterday.toISOString().slice(0, 10);
    const yTotal = liveTimesheets
      .filter(t => t.date === yISO)
      .reduce((s, t) => s + t.hours, 0);
    el.textContent = yTotal + 'h';
    if (labelEl) labelEl.textContent = yTotal > 0 ? 'YESTERDAY' : 'TODAY';
  }
}
