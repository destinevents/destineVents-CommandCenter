import { fetchPendingUsers, fetchAllUsers, updateUserRole } from '../../shared/services/userService.ts';
import { ROLE_LABELS, HQ_ROLES, ICC_ROLES } from '../../config/roles.ts';
import { escapeHtml } from '../../shared/utils/helpers.ts';
import { toast } from './ui.ts';
import type { InternUser, UserRole } from '../../shared/types';

const ASSIGNABLE_ROLES: UserRole[] = [
  'finance_officer', 'external_accountant', 'team_staff',
  'supervisor', 'intern',
];

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function portalLabel(role: UserRole): string {
  if (HQ_ROLES.includes(role)) return 'HQ';
  if (ICC_ROLES.includes(role)) return 'ICC';
  return '—';
}

function roleOptions(selectedRole: UserRole): string {
  return ASSIGNABLE_ROLES.map(r =>
    `<option value="${r}"${r === selectedRole ? ' selected' : ''}>${ROLE_LABELS[r]}</option>`
  ).join('');
}

function renderPending(users: InternUser[]): string {
  if (!users.length) {
    return '<tr><td colspan="5" style="color:var(--ink-3);padding:16px 0">No pending users</td></tr>';
  }
  return users.map(u => `
    <tr>
      <td>${escapeHtml(u.name)}</td>
      <td>${escapeHtml(u.email)}</td>
      <td>${u.requested_role ? escapeHtml(ROLE_LABELS[u.requested_role] ?? u.requested_role) : '<span style="color:var(--ink-3)">—</span>'}</td>
      <td>${formatDate(u.created_at)}</td>
      <td>
        <div style="display:flex;gap:6px;align-items:center">
          <select class="form-input" id="pending-role-${u.id}" style="padding:4px 8px;height:32px;font-size:12px;min-width:160px">
            ${u.requested_role ? `<option value="${u.requested_role}" selected>${ROLE_LABELS[u.requested_role] ?? u.requested_role}</option>` : ''}
            ${ASSIGNABLE_ROLES.filter(r => r !== u.requested_role).map(r =>
              `<option value="${r}">${ROLE_LABELS[r]}</option>`
            ).join('')}
          </select>
          <button class="btn btn-primary" style="padding:4px 12px;height:32px;font-size:12px"
            onclick="approveUser('${u.id}')">Approve</button>
        </div>
      </td>
    </tr>`).join('');
}

function renderAll(users: InternUser[]): string {
  if (!users.length) {
    return '<tr><td colspan="5" style="color:var(--ink-3);padding:16px 0">No users</td></tr>';
  }
  return users.map(u => `
    <tr>
      <td>${escapeHtml(u.name)}</td>
      <td>${escapeHtml(u.email)}</td>
      <td>${escapeHtml(ROLE_LABELS[u.role] ?? u.role)}</td>
      <td>${portalLabel(u.role)}</td>
      <td>
        <div style="display:flex;gap:6px;align-items:center">
          <select class="form-input" id="user-role-${u.id}" style="padding:4px 8px;height:32px;font-size:12px;min-width:180px"
            onchange="changeUserRole('${u.id}')">
            ${roleOptions(u.role)}
          </select>
        </div>
      </td>
    </tr>`).join('');
}

export async function loadUsers() {
  const [pending, all] = await Promise.all([fetchPendingUsers(), fetchAllUsers()]);
  const pendingBody = document.getElementById('users-pending-body');
  const allBody = document.getElementById('users-all-body');
  if (pendingBody) pendingBody.innerHTML = renderPending(pending);
  if (allBody) allBody.innerHTML = renderAll(all.filter(u => u.role !== 'pending' && u.role !== 'admin'));
}

export async function approveUser(id: string) {
  const select = document.getElementById(`pending-role-${id}`) as HTMLSelectElement | null;
  if (!select) return;
  const role = select.value as UserRole;
  const ok = await updateUserRole(id, role);
  if (ok) {
    toast(`User approved as ${ROLE_LABELS[role] ?? role}`, 'success');
    await loadUsers();
  } else {
    toast('Failed to approve user. Please try again.', 'error');
  }
}

export async function changeUserRole(id: string) {
  const select = document.getElementById(`user-role-${id}`) as HTMLSelectElement | null;
  if (!select) return;
  const role = select.value as UserRole;
  const ok = await updateUserRole(id, role);
  if (ok) {
    toast(`Role updated to ${ROLE_LABELS[role] ?? role}`, 'success');
    await loadUsers();
  } else {
    toast('Failed to update role. Please try again.', 'error');
  }
}
