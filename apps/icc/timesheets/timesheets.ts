// @ts-nocheck
import { createPager, attachFilterToolbar, escapeHtml, badge, avatarEl, skillPillGreen } from '@shared/utils/helpers.ts';
import { activityText } from '@shared/components/activityText.ts';
import { activityToText } from '@shared/utils/activityFormat.ts';
import { renderStatCards } from '@shared/components/statCard.ts';
import { renderFilterTabs } from '@shared/components/filterTabs.ts';
import { renderSkillPicker, resetSkillPicker } from '../tasks/skillPicker.ts';
import { STATUS_LABELS, MAX_DAILY_HOURS } from '@shared/constants.ts';
import { formatDateShort } from '@shared/utils/dateUtils.ts';
import { validateDailyHours } from '@shared/utils/validators.ts';
import { createTimesheet, updateTimesheet, deleteTimesheet, canEditTimesheet, sheetsForDate } from './timesheetService.ts';
import { logAudit } from '../audit/auditService.ts';
import { currentUser, activePage, sheetFilter, setSheetFilterValue, liveTasks, liveUsers, liveTimesheets, myTasks, mySheets } from '../core/state.ts';
import { toast, openModal, closeModal, updateBadges, MODAL_CLOSE_HOOKS } from '../core/ui.ts';
import { loadLiveTimesheets } from '../core/data.ts';
import { renderPage } from '../core/app.ts';

let pendingRejectId = null;

// Render the table in pages so hundreds of rows never hit the DOM at once
export const sheetPager = createPager(50, () => renderTimesheets());

attachFilterToolbar(['sheet-search', 'sheet-from', 'sheet-to'], () => {
  sheetPager.reset();
  renderTimesheets();
});

function applySheetFilters(sheets, taskById, userById) {
  const q    = document.getElementById('sheet-search').value.trim().toLowerCase();
  const from = document.getElementById('sheet-from').value;
  const to   = document.getElementById('sheet-to').value;

  let out = sheets;
  if (from) out = out.filter(ts => ts.date >= from);
  if (to)   out = out.filter(ts => ts.date <= to);
  if (q) out = out.filter(ts => {
    const task   = taskById.get(ts.task_id);
    const intern = userById.get(ts.intern_id);
    return (ts.activity_description || '').toLowerCase().includes(q) ||
      (ts.industry_category || '').toLowerCase().includes(q) ||
      (task?.title || '').toLowerCase().includes(q) ||
      (intern?.name || '').toLowerCase().includes(q);
  });
  return out;
}

export async function renderTimesheets() {
  const sheets = mySheets();
  const isAdmin = currentUser.role!=='intern';
  const taskById = new Map(liveTasks.map(t => [t.id, t]));
  const userById = new Map(liveUsers.map(u => [u.id, u]));

  const approvedH = sheets.filter(t=>t.status==='approved').reduce((s,t)=>s+t.hours,0);
  const pendingH  = sheets.filter(t=>t.status==='pending').reduce((s,t)=>s+t.hours,0);
  renderStatCards('sheet-stats', [
    {icon:'✅',label:'Approved Hours',value:approvedH+'h',valColor:'#10b981'},
    {icon:'⏳',label:'Pending Hours', value:pendingH+'h',valColor:'#f59e0b'},
    {icon:'📅',label:'Total Entries', value:sheets.length,valColor:'#252f27'},
  ]);

  renderFilterTabs('sheet-filters', ['all','pending','approved','rejected'], sheetFilter, 'set-sheet-filter', 'filter');

  const filtered = applySheetFilters(sheetFilter==='all' ? sheets : sheets.filter(t=>t.status===sheetFilter), taskById, userById);
  const visible = filtered.slice(0, sheetPager.limit);

  const adminCols = isAdmin ? ['<th>Intern</th>','<th>Date</th>','<th>Task</th>','<th>Activity</th>','<th>Hours</th>','<th>Category</th>','<th>Skills</th>','<th>Status</th>','<th></th>'] :
                              ['<th>Date</th>','<th>Task</th>','<th>Activity</th>','<th>Hours</th>','<th>Category</th>','<th>Skills</th>','<th>Status</th>','<th></th>'];
  document.getElementById('sheet-thead').innerHTML = `<tr>${adminCols.join('')}</tr>`;

  document.getElementById('sheet-tbody').innerHTML = visible.map((ts, i)=>{
    const task = taskById.get(ts.task_id);
    const intern = userById.get(ts.intern_id);
    // Approved entries are locked (spec §4.1); pending/rejected can be edited or removed
    const canDelete = ['pending','rejected'].includes(ts.status) && (isAdmin || ts.intern_id === currentUser.id);
    const delBtn = canDelete ? `<button class="btn-sm-reject" data-action="delete-sheet" data-id="${ts.id}" title="Delete entry">🗑</button>` : '';
    const editBtn = canEditTimesheet(ts, currentUser.id, currentUser.role)
      ? `<button class="btn-sm-ghost" data-action="edit-sheet" data-id="${ts.id}" title="Edit this entry while it is still awaiting approval">✎ Edit</button>` : '';
    const approveBtn = ts.status==='pending' && isAdmin ? `<button class="btn-sm-approve" data-action="approve-sheet" data-id="${ts.id}">✓ Approve</button><button class="btn-sm-reject" data-action="reject-sheet" data-id="${ts.id}">✕ Reject</button>` : '';
    const skillHtml = (ts.skills||[]).slice(0,2).map(skillPillGreen).join(' ')+((ts.skills||[]).length>2?`<span style="font-size:10px;color:var(--faint)">+${ts.skills.length-2}</span>`:'');
    return `<tr class="stagger-item" style="--i:${i}">
      ${isAdmin?`<td><div class="flex-gap-8">${avatarEl(intern?.avatar||'?',24)}<span class="text-bold">${escapeHtml(intern?.name)||'—'}</span></div></td>`:''}
      <td style="white-space:nowrap;color:#374151">${ts.date}</td>
      <td style="color:#374151">${escapeHtml(task?.title)||'<span class="no-task-flag" title="Entry is not linked to a task">⚠ no task</span>'}</td>
      <td class="text-ink">${activityText(ts.activity_description, { lines: 3, className: 'activity-text--cell' })}</td>
      <td class="hours-display">${ts.hours}h</td>
      <td class="text-muted">${ts.industry_category}</td>
      <td>${skillHtml}</td>
      <td>${badge(ts.status)}${ts.status === 'rejected' && ts.rejection_reason ? `<div style="font-size:10px;color:#ef4444;margin-top:3px;max-width:180px;line-height:1.3">${escapeHtml(ts.rejection_reason)}</div>` : ''}</td>
      <td><div style="display:flex;gap:5px">${approveBtn}${editBtn}${delBtn}</div></td>
    </tr>`;
  }).join('');

  document.getElementById('sheet-empty').style.display = filtered.length ? 'none' : 'block';
  document.getElementById('sheet-more').innerHTML = filtered.length > visible.length
    ? `<button class="kan-more-btn" data-action="sheet-load-more" style="width:calc(100% - 20px);margin:10px">Load more (showing ${visible.length} of ${filtered.length})</button>`
    : '';
}

// Id of the entry being edited, or null when logging a brand-new one
let editingSheetId = null;

// Any close path must clear edit mode — a stale editingSheetId would make the
// next "Log Hours" submit overwrite the previously edited entry
MODAL_CLOSE_HOOKS['modal-log-hours'] = () => {
  if (editingSheetId) {
    editingSheetId = null;
    setHoursModalMode(null);
  }
};

function setHoursModalMode(sheet) {
  const editing = !!sheet;
  document.getElementById('modal-log-hours-title').textContent = editing ? 'Edit Work Hours' : 'Log Work Hours';
  document.getElementById('log-hours-btn').textContent = editing ? 'Save Changes' : 'Save Entry';
  const note = document.getElementById('lh-edit-note');
  if (note) {
    note.textContent = editing && sheet.status === 'rejected'
      ? 'This entry was rejected. Saving your changes sends it back for approval.'
      : editing
        ? 'This entry is still awaiting approval, so you can still change it. Once approved it is locked for good.'
        : '';
    note.style.display = editing ? 'block' : 'none';
  }
}

const FORM_FIELD_BY_ID = {
  'lh-date':     'date',
  'lh-hours':    'hours',
  'lh-activity': 'activity_description',
};

// Fill the shared form. Called when the modal OPENS — never during table
// renders, or a realtime event / search keystroke would rebuild the skill
// picker and wipe the intern's in-progress selections mid-form.
function populateHoursForm(sheet) {
  ['lh-date', 'lh-hours', 'lh-activity'].forEach(id => {
    const el = document.getElementById(id);
    if (el) (el as HTMLInputElement).value = sheet ? (sheet[FORM_FIELD_BY_ID[id]] ?? '') : '';
  });
  document.getElementById('lh-cat').value = sheet?.industry_category || '';

  // Active tasks first; status suffix disambiguates same-titled tasks
  const activeFirst = [...myTasks()].sort((a, b) =>
    (['completed','reviewed'].includes(a.status) ? 1 : 0) - (['completed','reviewed'].includes(b.status) ? 1 : 0)
  );
  document.getElementById('lh-task').innerHTML = '<option value="">Not linked to a task</option>' +
    activeFirst.map(t=>`<option value="${t.id}">${escapeHtml(t.title)} — ${STATUS_LABELS[t.status]}${t.due_date ? ' · due ' + formatDateShort(t.due_date) : ''}</option>`).join('');

  // renderSkillPicker rebuilds the picker unselected, so restore afterwards
  renderSkillPicker('lh-skills-picker', 'lh-skills');
  if (!sheet) return;

  // An admin may be fixing an entry linked to a task that isn't in their own
  // task list — keep the link instead of silently dropping it on save
  const taskSelect = document.getElementById('lh-task') as HTMLSelectElement;
  if (sheet.task_id && ![...taskSelect.options].some(o => o.value === sheet.task_id)) {
    const task = liveTasks.find(t => t.id === sheet.task_id);
    taskSelect.insertAdjacentHTML('beforeend',
      `<option value="${sheet.task_id}">${escapeHtml(task?.title) || 'Linked task'}</option>`);
  }
  taskSelect.value = sheet.task_id || '';

  const picker = document.getElementById('lh-skills-picker');
  const select = document.getElementById('lh-skills') as HTMLSelectElement;
  (sheet.skills || []).forEach(s => {
    picker.querySelector(`.skill-tag[data-value="${s}"]`)?.classList.add('selected');
    [...select.options].forEach(o => { if (o.value === s) o.selected = true; });
  });
}

export function openLogHours() {
  editingSheetId = null;
  setHoursModalMode(null);
  populateHoursForm(null);
  openModal('modal-log-hours');
}

// Reopen a pending/rejected entry for editing. Approved entries never reach
// here — the table hides the button and the DB trigger rejects the update.
export function openEditHours(id) {
  const sheet = liveTimesheets.find(s => s.id === id);
  if (!sheet) { toast('That entry is no longer available.'); return; }
  if (!canEditTimesheet(sheet, currentUser.id, currentUser.role)) {
    toast('This entry is already approved and can no longer be changed.');
    return;
  }
  editingSheetId = id;
  setHoursModalMode(sheet);
  populateHoursForm(sheet);
  openModal('modal-log-hours');
}

export async function setSheetFilter(f) { setSheetFilterValue(f); await renderTimesheets(); }

export function exportTimesheetCSV() {
  const sheets = mySheets();
  const taskById = new Map(liveTasks.map(t => [t.id, t]));
  const userById = new Map(liveUsers.map(u => [u.id, u]));
  const filtered = applySheetFilters(
    sheetFilter === 'all' ? sheets : sheets.filter(t => t.status === sheetFilter),
    taskById, userById
  );
  if (!filtered.length) { toast('No timesheet entries to export.'); return; }
  const isAdmin = currentUser.role !== 'intern';
  let csv = (isAdmin ? 'Intern,' : '') + 'Date,Task,Activity,Hours,Category,Skills,Status\n';
  filtered.forEach(ts => {
    const task = taskById.get(ts.task_id);
    const intern = userById.get(ts.intern_id);
    const row = [
      ...(isAdmin ? [`"${(intern?.name || '—').replace(/"/g, '""')}"`] : []),
      `"${ts.date}"`,
      `"${(task?.title || '—').replace(/"/g, '""')}"`,
      `"${activityToText(ts.activity_description).replace(/"/g, '""')}"`,
      ts.hours,
      `"${ts.industry_category}"`,
      `"${(ts.skills || []).join('; ')}"`,
      `"${ts.status}"`,
    ];
    csv += row.join(',') + '\n';
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const fname = (currentUser.role === 'intern' ? currentUser.name || 'Intern' : 'All_Interns').replace(/ /g, '_');
  a.download = `${fname}_Timesheets.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Timesheets exported!');
}

export async function approveSheet(id) {
  const result = await updateTimesheet(id, {
    status: 'approved',
    approved_by: currentUser.id,
    approved_at: new Date().toISOString()
  });
  if (!result) { toast('Could not approve entry. Please try again.'); return; }

  logAudit('approved_timesheet', 'timesheet', id, { approved_by: currentUser.id }, currentUser.id);

  toast('Entry approved ✓');
  await refreshAfterSheetChange();
}

// Approving from the Approvals queue used to redraw the Timesheets table and
// the Dashboard — neither of which is on screen at the time — so the entry
// just approved stayed in the queue, and the Interns cards kept their old
// counts. Redraw whichever page the user is actually looking at, always from
// freshly loaded rows.
async function refreshAfterSheetChange() {
  await loadLiveTimesheets();
  await updateBadges();
  await renderPage(activePage);
}

export function rejectSheet(id) {
  pendingRejectId = id;
  document.getElementById('reject-reason-input').value = '';
  openModal('modal-reject-reason');
}

export async function confirmReject() {
  const reason = document.getElementById('reject-reason-input').value.trim();
  if (!reason) {
    document.getElementById('reject-reason-input').style.borderColor = '#ef4444';
    return;
  }
  document.getElementById('reject-reason-input').style.borderColor = '';
  const result = await updateTimesheet(pendingRejectId, {
    status: 'rejected',
    rejection_reason: reason
  });
  if (result) {
    logAudit('rejected_timesheet', 'timesheet', pendingRejectId, { reason }, currentUser.id);
    closeModal('modal-reject-reason');
    pendingRejectId = null;
    // Badges are counted from the loaded rows, so the reload has to come
    // first — otherwise the queue count still includes the entry just rejected.
    await refreshAfterSheetChange();
    toast('Entry rejected — intern will see the reason.');
  } else {
    toast('Error rejecting entry. Please try again.');
  }
}

export async function deleteSheet(id) {
  const ts = liveTimesheets.find(s => s.id === id);
  if (!ts) return;
  if (!confirm(`Delete the ${ts.hours}h entry for ${ts.date}? This cannot be undone.`)) return;

  const ok = await deleteTimesheet(id);
  if (!ok) { toast('Could not delete the entry. Please try again.'); return; }

  logAudit('timesheet_deleted', 'timesheet', id, { date: ts.date, hours: ts.hours }, currentUser.id);
  toast('Entry deleted.');
  await refreshAfterSheetChange();
}

export async function logHours() {
  const editing  = editingSheetId ? liveTimesheets.find(s => s.id === editingSheetId) : null;
  if (editingSheetId && !editing) { toast('That entry is no longer available.'); closeModal('modal-log-hours'); return; }

  const date     = document.getElementById('lh-date').value;
  const hours    = parseFloat(document.getElementById('lh-hours').value);
  const activity = document.getElementById('lh-activity').value.trim();
  if(!date||!hours||!activity) { toast('Please fill in required fields'); return; }

  // An admin may be correcting someone else's entry — the cap applies to the
  // intern who owns the hours, not to whoever is typing
  const ownerId = editing ? editing.intern_id : currentUser.id;

  // The entry being edited is left out, so its own hours are not counted twice
  const existingEntries = sheetsForDate(liveTimesheets, date, ownerId, editingSheetId);
  const existingHours = existingEntries.reduce((s, t) => s + t.hours, 0);
  if (existingEntries.length > 0) {
    const who = editing && ownerId !== currentUser.id ? 'This intern already has' : 'You already have';
    const confirmed = confirm(
      `⚠️ ${who} ${existingHours}h logged for ${date}.\n\nDo you want to ${editing ? 'save this entry for' : 'add another entry for'} the same date?`
    );
    if (!confirmed) return;
  }

  const dailyErr = validateDailyHours(existingHours, hours, MAX_DAILY_HOURS);
  if (dailyErr) {
    toast('⚠️ ' + dailyErr);
    return;
  }

  const logBtn = document.getElementById('log-hours-btn');
  const btnLabel = editing ? 'Save Changes' : 'Save Entry';
  if (logBtn) { logBtn.disabled = true; logBtn.textContent = 'Saving…'; }
  const restoreBtn = () => { if (logBtn) { logBtn.disabled = false; logBtn.textContent = btnLabel; } };

  const skillsEl = document.getElementById('lh-skills');
  const skills   = [...skillsEl.selectedOptions].map(o=>o.value);
  const taskId   = document.getElementById('lh-task').value || null;

  const fields = {
    date,
    hours,
    task_id:              taskId,
    activity_description: activity,
    industry_category:    document.getElementById('lh-cat').value,
    skills,
  };

  if (editing) {
    // A rejected entry re-enters the queue once fixed; the reason no longer
    // applies, so it is cleared with it (spec §4.1)
    const result = await updateTimesheet(editingSheetId, {
      ...fields,
      status:           'pending',
      rejection_reason: null,
    });
    if (!result) { restoreBtn(); toast('Could not save your changes. Please try again.'); return; }

    logAudit('timesheet_edited', 'timesheet', editingSheetId, { date, hours, was: editing.status }, currentUser.id);
    editingSheetId = null;
    closeModal('modal-log-hours');
    restoreBtn();
    setHoursModalMode(null); // back to "Log Work Hours" for the next open
    toast(editing.status === 'rejected' ? 'Entry updated — sent back for approval.' : 'Entry updated. Still pending approval.');
  } else {
    const result = await createTimesheet({
      ...fields,
      intern_id: currentUser.id,
      status:    'pending',
    });
    if (!result) { restoreBtn(); return; }

    logAudit('hours_logged', 'timesheet', result.id, { date, hours }, currentUser.id);
    closeModal('modal-log-hours');
    restoreBtn();
    toast('Hours logged! Pending approval.');
  }

  ['lh-date','lh-hours','lh-activity'].forEach(id => document.getElementById(id).value = '');
  resetSkillPicker('lh-skills-picker');
  await refreshAfterSheetChange();
}
