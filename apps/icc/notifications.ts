// @ts-nocheck
// Notification center: history + unread badge in the topbar bell, fed by the
// intern_notifications table (rows are created by DB triggers — see
// database/schema/notifications.sql). Live toasts come from the realtime
// INSERT subscription in app.js calling handleIncomingNotification.
import { fetchNotifications, markNotificationsRead } from '../../shared/services/notificationService.ts';
import { showToast } from '../../shared/components/toast.ts';
import { escapeHtml } from '../../shared/utils/helpers.ts';
import { formatDateShort } from '../../shared/utils/dateUtils.ts';
import { currentUser } from './state.ts';
import { goPage } from './app.ts';

let liveNotifications = [];

export async function loadNotifications() {
  liveNotifications = await fetchNotifications(currentUser.id);
  renderNotifCenter();
}

function notifTime(iso) {
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return formatDateShort(iso.slice(0, 10));
}

function renderNotifCenter() {
  const count = liveNotifications.filter(n => !n.read).length;
  const badge = document.getElementById('nc-count');
  badge.textContent = count;
  badge.style.display = count > 0 ? '' : 'none';
  const bell = document.getElementById('nc-bell');
  if (bell && count > 0) {
    bell.classList.remove('has-unread');
    void bell.offsetWidth;
    bell.classList.add('has-unread');
  }

  document.getElementById('nc-list').innerHTML = liveNotifications.map(n => `
    <button class="nc-item${n.read ? '' : ' nc-unread'}" data-action="open-notification" data-id="${n.id}" data-page="${n.link_page || ''}">
      <span class="nc-msg">${escapeHtml(n.message)}</span>
      <span class="nc-time">${notifTime(n.created_at)}</span>
    </button>`).join('') || '<div class="nc-empty">No notifications yet.</div>';
}

export function toggleNotifCenter(show) {
  const panel = document.getElementById('nc-panel');
  const next = show ?? panel.style.display === 'none';
  panel.style.display = next ? 'block' : 'none';
}

export async function openNotification(id, page) {
  const n = liveNotifications.find(x => x.id === id);
  if (n && !n.read) {
    n.read = true;
    renderNotifCenter();
    markNotificationsRead([id]);
  }
  toggleNotifCenter(false);
  if (page) await goPage(page);
}

export function markAllNotificationsRead() {
  const ids = liveNotifications.filter(n => !n.read).map(n => n.id);
  if (!ids.length) return;
  liveNotifications.forEach(n => { n.read = true; });
  renderNotifCenter();
  markNotificationsRead(ids);
}

export function handleIncomingNotification(payload) {
  const n = payload.new;
  if (!n || n.user_id !== currentUser.id) return;
  liveNotifications.unshift(n);
  renderNotifCenter();
  showToast(n.message, '', 6000);
}

// Close the panel when clicking anywhere outside the bell/panel
document.addEventListener('click', (e) => {
  const panel = document.getElementById('nc-panel');
  if (panel && panel.style.display !== 'none' && !e.target.closest('.nc-wrap')) {
    panel.style.display = 'none';
  }
});
