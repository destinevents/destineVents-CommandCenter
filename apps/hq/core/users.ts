import { fetchPendingUsers, fetchAllUsers, updateUserRole, deleteUser } from '@shared/core/userService.ts';
import { ROLE_LABELS, HQ_ROLES, ICC_ROLES } from '@config/roles.ts';
import { escapeHtml } from '@shared/utils/helpers.ts';
import { toast } from './ui.ts';
import type { InternUser, UserRole } from '@shared/types';

const ASSIGNABLE_ROLES: UserRole[] = [
  'finance_officer', 'external_accountant', 'team_staff', 'freelancer',
  'supervisor', 'intern',
];

// Badge colour per role, so the table can be scanned by colour before reading
const ROLE_BADGE: Record<UserRole, string> = {
  admin:               'completed',
  finance_officer:     'active',
  external_accountant: 'sent',
  team_staff:          'proposal',
  freelancer:          'draft',
  supervisor:          'issued',
  intern:              'lead',
  pending:             'pending',
};

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function portalLabel(role: UserRole): string {
  if (HQ_ROLES.includes(role)) return 'HQ';
  if (ICC_ROLES.includes(role)) return 'ICC';
  return '—';
}

function initials(name: string, email: string): string {
  const source = name.trim() || email.split('@')[0] || '?';
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1
    ? parts[0][0] + parts[1][0]
    : source.slice(0, 2);
  return letters.toUpperCase();
}

function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role] ?? role;
}

function roleBadge(role: UserRole): string {
  return `<span class="badge badge-${ROLE_BADGE[role] ?? 'lead'}" style="white-space:nowrap">${escapeHtml(roleLabel(role))}</span>`;
}

function portalTag(role: UserRole): string {
  const label = portalLabel(role);
  return label === '—'
    ? '<span style="color:var(--ink-3)">—</span>'
    : `<span class="portal-tag">${label}</span>`;
}

function userCell(u: InternUser): string {
  return `
    <div class="user-cell">
      <div class="user-cell-avatar">${escapeHtml(initials(u.name, u.email))}</div>
      <div>
        <div class="user-cell-name">${escapeHtml(u.name) || '<span style="color:var(--ink-3)">Unnamed</span>'}</div>
        <div class="user-cell-email">${escapeHtml(u.email)}</div>
      </div>
    </div>`;
}

function roleOptions(selectedRole: UserRole): string {
  return ASSIGNABLE_ROLES.map(r =>
    `<option value="${r}"${r === selectedRole ? ' selected' : ''}>${roleLabel(r)}</option>`
  ).join('');
}

// Names for the confirmation prompt, keyed by id. Held here rather than
// interpolated into the inline onclick so a name containing a quote or an
// apostrophe cannot break out of the handler.
const namesById = new Map<string, string>();

function removeButton(id: string, label: string): string {
  return `<button class="btn-danger-soft" onclick="removeUser('${id}')">${label}</button>`;
}

function renderPending(users: InternUser[]): string {
  return users.map(u => `
    <tr>
      <td>${userCell(u)}</td>
      <td>${u.requested_role
        ? roleBadge(u.requested_role)
        : '<span style="color:var(--ink-3)">—</span>'}</td>
      <td style="font-size:11px;color:var(--ink-3);white-space:nowrap">${formatDate(u.created_at)}</td>
      <td>
        <div class="flex-gap">
          <select class="form-input role-select" id="pending-role-${u.id}">
            ${u.requested_role ? `<option value="${u.requested_role}" selected>${roleLabel(u.requested_role)}</option>` : ''}
            ${ASSIGNABLE_ROLES.filter(r => r !== u.requested_role).map(r =>
              `<option value="${r}">${roleLabel(r)}</option>`
            ).join('')}
          </select>
          <button class="btn btn-primary" style="padding:5px 14px;height:32px;font-size:12px"
            onclick="approveUser('${u.id}')">Approve</button>
        </div>
      </td>
      <td style="text-align:right">${removeButton(u.id, 'Reject')}</td>
    </tr>`).join('');
}

// The role select doubles as the role display — a separate badge column would
// print the same word twice on every row.
function renderAll(users: InternUser[]): string {
  if (!users.length) {
    return '<tr><td colspan="4"><div class="empty-state">No users yet — approved sign-ups appear here</div></td></tr>';
  }
  return users.map(u => `
    <tr>
      <td>${userCell(u)}</td>
      <td>${portalTag(u.role)}</td>
      <td>
        <select class="form-input role-select" id="user-role-${u.id}"
          onchange="changeUserRole('${u.id}')">
          ${roleOptions(u.role)}
        </select>
      </td>
      <td style="text-align:right">${removeButton(u.id, 'Remove')}</td>
    </tr>`).join('');
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function renderSummary(activeCount: number, pendingCount: number) {
  const summary = document.getElementById('users-summary');
  if (summary) {
    summary.textContent = pendingCount
      ? `${plural(activeCount, 'user')} · ${pendingCount} awaiting approval`
      : plural(activeCount, 'user');
  }
  const allCount = document.getElementById('users-all-count');
  if (allCount) allCount.textContent = plural(activeCount, 'account');
}

export async function loadUsers() {
  const [pending, all] = await Promise.all([fetchPendingUsers(), fetchAllUsers()]);
  namesById.clear();
  [...pending, ...all].forEach(u => namesById.set(u.id, u.name));

  // The pending block is hidden outright when nobody is waiting — an empty
  // table of headers reads as a broken section.
  const pendingSection = document.getElementById('users-pending-section');
  if (pendingSection) pendingSection.style.display = pending.length ? '' : 'none';
  const pendingCount = document.getElementById('users-pending-count');
  if (pendingCount) pendingCount.textContent = String(pending.length);
  const pendingBody = document.getElementById('users-pending-body');
  if (pendingBody) pendingBody.innerHTML = renderPending(pending);

  const active = all.filter(u => u.role !== 'pending' && u.role !== 'admin');
  const allBody = document.getElementById('users-all-body');
  if (allBody) allBody.innerHTML = renderAll(active);

  renderSummary(active.length, pending.length);
}

export async function removeUser(id: string) {
  const name = namesById.get(id) ?? 'this user';
  const confirmed = window.confirm(
    `Permanently remove ${name}?\n\n` +
    'Their account, and everything attached to it, is deleted from both HQ and ' +
    'the Intern Command Center. This cannot be undone.'
  );
  if (!confirmed) return;

  const result = await deleteUser(id);
  if (!result.ok) {
    toast(result.error || 'Failed to remove the user. Please try again.', 'error');
    return;
  }
  toast(`${name} removed.`, 'success');
  await loadUsers();
}

export async function approveUser(id: string) {
  const select = document.getElementById(`pending-role-${id}`) as HTMLSelectElement | null;
  if (!select) return;
  const role = select.value as UserRole;
  const ok = await updateUserRole(id, role);
  if (ok) {
    toast(`User approved as ${roleLabel(role)}`, 'success');
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
    toast(`Role updated to ${roleLabel(role)}`, 'success');
    await loadUsers();
  } else {
    toast('Failed to update role. Please try again.', 'error');
  }
}
