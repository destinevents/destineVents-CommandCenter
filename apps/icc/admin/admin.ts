// @ts-nocheck
import { sb } from '@shared/core/supabase';
import { fetchAuditLogs } from '../audit/auditService.ts';
import { escapeHtml, avatarEl, skillPill, skillPillGreen } from '@shared/utils/helpers.ts';
import { activityText } from '@shared/components/activityText.ts';
import { activityToText } from '@shared/utils/activityFormat.ts';
import { buildTimesheetReportHTML } from './timesheetReport.ts';
import { formatDateShort, formatTime } from '@shared/utils/dateUtils.ts';
import { liveUsers, liveTasks, liveTimesheets, pendingApprovals, currentUser } from '../core/state.ts';
import { toast, openModal, closeModal } from '../core/ui.ts';
import { loadLiveUsers } from '../core/data.ts';
import { createUser, deleteUser } from '@shared/core/userService.ts';

let showCompletedInterns = false;

export function setInternTab(completed) {
  showCompletedInterns = completed;
  document.getElementById('intern-tab-active')?.classList.toggle('active', !completed);
  document.getElementById('intern-tab-completed')?.classList.toggle('active', completed);
  renderInterns();
}

// ── Add Intern ────────────────────────────────────────────────────────────
// Invites someone and sets their role in one step. Both portals read the same
// intern_users table, so whoever is added here also shows up under Users in HQ.

const ADD_INTERN_FIELDS = ['ai-name', 'ai-email', 'ai-school', 'ai-program', 'ai-hours'];

function setAddInternError(message) {
  const el = document.getElementById('ai-error');
  if (el) el.textContent = message || '';
}

export function openAddIntern() {
  ADD_INTERN_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const roleEl = document.getElementById('ai-role');
  if (roleEl) roleEl.value = 'intern';
  setAddInternError('');
  openModal('modal-add-intern');
}

export async function handleAddIntern() {
  const val = id => (document.getElementById(id)?.value ?? '').trim();
  const name = val('ai-name');
  const email = val('ai-email');
  const role = val('ai-role') || 'intern';
  const hours = val('ai-hours');

  if (!name) return setAddInternError('Full name is required.');
  if (!email) return setAddInternError('Email is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return setAddInternError('Enter a valid email address.');
  }
  if (hours && (!Number.isInteger(Number(hours)) || Number(hours) < 0)) {
    return setAddInternError('Required hours must be a whole number.');
  }
  setAddInternError('');

  const btn = document.getElementById('ai-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

  try {
    const result = await createUser({
      name,
      email,
      role,
      school: val('ai-school'),
      program: val('ai-program'),
      required_hours: hours ? Number(hours) : null,
    });

    if (!result.ok) {
      setAddInternError(result.error || 'Could not add the user.');
      return;
    }

    closeModal('modal-add-intern');
    await loadLiveUsers();
    renderInterns();
    toast(`Invite sent to ${name}. They'll set their own password.`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Send Invite'; }
  }
}

export async function completeIntern(uid) {
  const intern = liveUsers.find(u => u.id === uid);
  if (!intern) return;
  if (!confirm(`Mark ${intern.name} as completed? They'll move to the Completed tab.`)) return;
  const { error } = await sb.from('intern_users').update({ completed_at: new Date().toISOString() }).eq('id', uid);
  if (error) { toast('Failed to update — try again.'); return; }
  await loadLiveUsers();
  renderInterns();
  toast(`${intern.name} marked as completed.`);
}

// Deleting is not the same as completing: "Mark Complete" archives someone who
// finished their hours and keeps their record, this erases the account outright.
// Both portals share intern_users, so the person also disappears from HQ Users.
export async function deleteIntern(uid) {
  const intern = liveUsers.find(u => u.id === uid);
  if (!intern) return;
  const confirmed = confirm(
    `Permanently remove ${intern.name}?\n\n` +
    'Their account, timesheets and tasks are deleted from both the Intern ' +
    'Command Center and HQ. This cannot be undone.\n\n' +
    'To archive someone who has finished instead, use "Mark Complete".'
  );
  if (!confirmed) return;

  const result = await deleteUser(uid);
  if (!result.ok) {
    toast(result.error || 'Failed to remove — try again.');
    return;
  }
  await loadLiveUsers();
  renderInterns();
  toast(`${intern.name} removed.`);
}

export async function reopenIntern(uid) {
  const intern = liveUsers.find(u => u.id === uid);
  if (!intern) return;
  const { error } = await sb.from('intern_users').update({ completed_at: null }).eq('id', uid);
  if (error) { toast('Failed to reactivate — try again.'); return; }
  await loadLiveUsers();
  renderInterns();
  toast(`${intern.name} reactivated.`);
}

function topSkillsFor(sheets, n) {
  const map = {};
  sheets.forEach((ts) =>
    (ts.skills || []).forEach((s) => {
      map[s] = (map[s] || 0) + 1;
    })
  );
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([s]) => s);
}

export async function renderApprovals() {
  const pending = pendingApprovals();
  document.getElementById('appr-sub').textContent =
    `${pending.length} entr${pending.length === 1 ? 'y' : 'ies'} awaiting review`;
  if (!pending.length) {
    document.getElementById('appr-list').innerHTML =
      `<div class="empty-state surface"><div class="empty-icon">🎉</div>All caught up — no pending approvals!</div>`;
    return;
  }
  const taskById = new Map(liveTasks.map((t) => [t.id, t]));
  const userById = new Map(liveUsers.map((u) => [u.id, u]));
  document.getElementById('appr-list').innerHTML = pending
    .map((ts, i) => {
      const task = taskById.get(ts.task_id);
      const intern = userById.get(ts.intern_id);
      return `<div class="appr-card stagger-item" style="--i:${i};margin-bottom:12px">
      <div class="appr-layout">
        <div style="display:flex;gap:14px;align-items:flex-start">
          ${avatarEl(intern?.avatar || '?', 42)}
          <div>
            <div style="font-weight:700;font-size:14px;color:#1a1a1a">${escapeHtml(intern?.name) || '—'}</div>
            <div style="font-size:11px;color:var(--faint)">${intern?.school || ''} · ${ts.date}</div>
            <div style="margin-top:8px">${activityText(ts.activity_description, { lines: 5, className: 'activity-text--card' })}</div>
            ${task ? `<div class="task-link-tag">📋 ${escapeHtml(task.title)}</div>` : ''}
            <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px">${(ts.skills || []).map(skillPillGreen).join('')}</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0">
          <div style="font-size:22px;font-weight:800;color:#252f27">${ts.hours}h</div>
          <span style="font-size:11px;color:var(--muted);background:#f3f4f6;border-radius:6px;padding:2px 8px">${ts.industry_category}</span>
          <div style="display:flex;gap:7px;margin-top:4px">
            <button class="btn-primary" style="padding:8px 16px;font-size:12px" data-action="approve-sheet" data-id="${ts.id}">✓ Approve</button>
            <button class="btn-sm-reject" style="padding:8px 14px;border:1.5px solid #fecaca" data-action="reject-sheet" data-id="${ts.id}">✕ Reject</button>
          </div>
        </div>
      </div>
    </div>`;
    })
    .join('');
}

export async function renderInterns() {
  const allInterns = liveUsers.filter((u) => u.role === 'intern');
  const interns = allInterns.filter(u => showCompletedInterns ? !!u.completed_at : !u.completed_at);
  const sheetsByIntern = new Map();
  liveTimesheets.forEach(t => {
    if (!sheetsByIntern.has(t.intern_id)) sheetsByIntern.set(t.intern_id, []);
    sheetsByIntern.get(t.intern_id).push(t);
  });

  if (!interns.length) {
    document.getElementById('interns-grid').innerHTML =
      `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">${showCompletedInterns ? '🎓' : '👥'}</div>${showCompletedInterns ? 'No completed interns yet.' : 'No active interns.'}</div>`;
    return;
  }

  document.getElementById('interns-grid').innerHTML = interns
    .map((intern, i) => {
      const iSheets = sheetsByIntern.get(intern.id) || [];
      const approved = iSheets
        .filter((t) => t.status === 'approved')
        .reduce((s, t) => s + t.hours, 0);
      const pending = iSheets.filter((t) => t.status === 'pending').length;
      const done = liveTasks.filter(
        (t) => t.assigned_to === intern.id && ['completed', 'reviewed'].includes(t.status)
      ).length;
      const topSkills = topSkillsFor(iSheets.filter((t) => t.status === 'approved'), 3);
      const completedDate = intern.completed_at ? new Date(intern.completed_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : null;
      return `<div class="intern-card stagger-item" style="--i:${i}">
      <div class="intern-card-head">
        ${avatarEl(intern.avatar, 46, '#C9A84C')}
        <div style="flex:1">
          <div class="intern-card-name">${escapeHtml(intern.name)}</div>
          <div class="intern-card-sub">${intern.program} · ${intern.school}</div>
          ${completedDate ? `<div class="intern-completed-badge">✓ Completed ${completedDate}</div>` : ''}
        </div>
      </div>
      <div class="intern-stats">
        <div class="intern-stat"><div class="sv">${intern.required_hours ? `${approved} / ${intern.required_hours}h` : approved + 'h'}</div><div class="sl">${intern.required_hours ? `Approved (${Math.max(0, intern.required_hours - approved)}h left)` : 'Approved hrs'}</div></div>
        <div class="intern-stat"><div class="sv">${done}</div><div class="sl">Tasks done</div></div>
        <div class="intern-stat"><div class="sv">${pending}</div><div class="sl">Pending</div></div>
      </div>
      <div class="intern-skills">
        ${topSkills.length ? `<div class="section-label">TOP SKILLS</div><div class="flex-wrap">${topSkills.map(skillPill).join('')}</div>` : '<div style="font-size:12px;color:var(--faint)">No approved entries yet.</div>'}
      </div>
      <div style="padding:10px 16px;border-top:1px solid #f3f4f6;display:flex;gap:7px;flex-wrap:wrap">
        <button class="btn-sm-approve" style="font-size:11px" data-action="export-excel" data-id="${intern.id}">📊 Excel</button>
        <button style="font-size:11px;background:#eff6ff;color:#2563eb;border:none;border-radius:6px;padding:4px 10px;font-weight:600;cursor:pointer;font-family:inherit" data-action="export-pdf" data-id="${intern.id}">📄 PDF</button>
        ${intern.completed_at
          ? `<button style="font-size:11px;background:#fef9ec;color:#92400e;border:none;border-radius:6px;padding:4px 10px;font-weight:600;cursor:pointer;font-family:inherit" data-action="reopen-intern" data-id="${intern.id}">↩ Reactivate</button>`
          : `<button style="font-size:11px;background:#f0fdf4;color:#166534;border:none;border-radius:6px;padding:4px 10px;font-weight:600;cursor:pointer;font-family:inherit" data-action="complete-intern" data-id="${intern.id}">✓ Mark Complete</button>`}
        ${currentUser.role === 'admin'
          ? `<button style="font-size:11px;background:#fef2f2;color:#b91c1c;border:none;border-radius:6px;padding:4px 10px;font-weight:600;cursor:pointer;font-family:inherit" data-action="delete-intern" data-id="${intern.id}">🗑 Remove</button>`
          : ''}
      </div>
    </div>`;
    })
    .join('');
}

export async function renderReports() {
  const interns = liveUsers.filter((u) => u.role === 'intern');
  const totalApprH = liveTimesheets
    .filter((t) => t.status === 'approved')
    .reduce((s, t) => s + t.hours, 0);
  const pending = pendingApprovals().length;

  document.getElementById('report-overview').innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <span style="font-size:22px">📊</span>
      <h3 style="margin:0;font-size:15px;font-weight:700;color:#252f27">System Overview</h3>
    </div>
    <div class="grid4">
      ${[
        ['Total Interns', interns.length],
        ['Total Tasks', liveTasks.length],
        ['Approved Hours', totalApprH + 'h'],
        ['Pending Approvals', pending],
      ]
        .map(
          ([k, v]) => `
        <div style="background:#f9fafb;border-radius:8px;padding:12px 14px">
          <div style="font-size:22px;font-weight:800;color:#252f27">${v}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">${k}</div>
        </div>`
        )
        .join('')}
    </div>`;

  document.getElementById('reports-tbody').innerHTML = interns
    .map((intern) => {
      const iSheets = liveTimesheets.filter(
        (t) => t.intern_id === intern.id && t.status === 'approved'
      );
      const iHours = iSheets.reduce((s, t) => s + t.hours, 0);
      const iDone = liveTasks.filter(
        (t) => t.assigned_to === intern.id && ['completed', 'reviewed'].includes(t.status)
      ).length;
      const skillSet = new Set();
      iSheets.forEach((ts) => (ts.skills || []).forEach((s) => skillSet.add(s)));
      const skillArr = [...skillSet];
      return `<tr>
      <td><div class="flex-gap-8">${avatarEl(intern.avatar, 28)}<span class="text-bold">${escapeHtml(intern.name)}</span></div></td>
      <td style="color:#374151">${intern.school}</td>
      <td style="color:#374151">${intern.program}</td>
      <td style="font-weight:800;color:#252f27">${iHours}h${intern.required_hours ? `<span style="font-weight:500;color:var(--muted)"> / ${intern.required_hours}h</span>` : ''}</td>
      <td style="color:#374151">${iDone} completed</td>
      <td><div style="display:flex;gap:4px;flex-wrap:wrap">${skillArr.slice(0, 2).map(skillPill).join('')}${skillArr.length > 2 ? `<span style="font-size:10px;color:var(--faint)">+${skillArr.length - 2}</span>` : ''}</div></td>
      <td><div style="display:flex;gap:5px">
        <button style="background:#ecfdf5;color:#16a34a;border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer" data-action="export-excel" data-id="${intern.id}">📊 Excel</button>
        <button style="background:#eff6ff;color:#2563eb;border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer" data-action="export-pdf" data-id="${intern.id}">📄 PDF</button>
      </div></td>
    </tr>`;
    })
    .join('');
}

export function exportExcel(uid) {
  const intern = liveUsers.find((u) => u.id === uid);
  if (!intern) {
    toast('Intern not found — please refresh.');
    return;
  }
  const sheets = liveTimesheets.filter((t) => t.intern_id === uid && t.status === 'approved');
  // Quoted CSV fields may span lines, so the activity keeps its bullet layout
  // instead of being flattened into one run-on cell.
  const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  let csv = 'Date,Task,Activity,Hours,Category,Skills,Status\n';
  sheets.forEach((ts) => {
    const task = liveTasks.find((t) => t.id === ts.task_id);
    csv += [
      cell(ts.date),
      cell(task?.title || '—'),
      cell(activityToText(ts.activity_description)),
      ts.hours,
      cell(ts.industry_category),
      cell((ts.skills || []).join('; ')),
      cell(ts.status),
    ].join(',') + '\n';
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${intern.name.replace(/ /g, '_')}_Timesheet.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Excel export downloaded!');
}

export function exportPDF(uid) {
  const intern = liveUsers.find((u) => u.id === uid);
  if (!intern) {
    toast('Intern not found — please refresh.');
    return;
  }
  const sheets = liveTimesheets.filter((t) => t.intern_id === uid && t.status === 'approved');
  const taskById = new Map(liveTasks.map((t) => [t.id, t]));

  const html = buildTimesheetReportHTML({
    intern,
    supervisor: liveUsers.find((u) => u.role === 'supervisor') || { name: 'Supervisor' },
    sheets,
    taskTitleFor: (ts) => taskById.get(ts.task_id)?.title,
    topSkills: topSkillsFor(sheets, 5),
    reportDate: new Date().toLocaleDateString('en-PH'),
  });

  const w = window.open('', '_blank');
  if (!w) {
    toast('Pop-up blocked — please allow pop-ups for this site.');
    return;
  }
  w.document.write(html);
  w.document.close();
  w.print();
  toast('PDF report opened for printing!');
}

// ── Audit Log ─────────────────────────────────────────────
// Cache the page between visits — the log rarely changes minute to minute
let auditLogCache = { logs: null, at: 0 };
const AUDIT_CACHE_MS = 60000;

export async function renderAuditLog() {
  if (!auditLogCache.logs || Date.now() - auditLogCache.at > AUDIT_CACHE_MS) {
    auditLogCache = { logs: await fetchAuditLogs(), at: Date.now() };
  }
  const logs = auditLogCache.logs;
  const userById = new Map(liveUsers.map(u => [u.id, u]));
  document.getElementById('audit-tbody').innerHTML = logs.map(l => {
    const who = userById.get(l.performed_by) || {};
    const details = l.metadata && Object.keys(l.metadata).length
      ? Object.entries(l.metadata)
          .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
          .join(' · ')
      : '—';
    return `<tr>
      <td style="white-space:nowrap;color:#374151">${formatDateShort(l.created_at?.slice(0, 10))} · ${formatTime(l.created_at)}</td>
      <td><div class="flex-gap-8">${avatarEl(who.avatar || '?', 24)}<span class="text-bold">${escapeHtml(who.name) || '—'}</span></div></td>
      <td class="text-ink">${escapeHtml((l.action || '').replace(/_/g, ' '))}</td>
      <td class="text-muted">${escapeHtml(l.target_type) || '—'}</td>
      <td class="truncate text-muted">${escapeHtml(details)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" class="no-data-center">No activity logged yet.</td></tr>';
}
