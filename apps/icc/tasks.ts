// @ts-nocheck
import { createPager, attachFilterToolbar, escapeHtml, badge, pBadge, skillPill } from '../../shared/utils/helpers.ts';
import { emptyStateHTML } from '../../shared/components/emptyState.ts';
import { renderSkillPicker, resetSkillPicker } from '../../shared/components/skillPicker.ts';
import { STATUS_LABELS, STATUS_COLORS, KANBAN_COLS } from '../../shared/constants.ts';
import { formatDateShort, todayISO } from '../../shared/utils/dateUtils.ts';
import { validateRequired } from '../../shared/utils/validators.ts';
import { createTask, updateTask, deleteTask } from '../../shared/services/taskService.ts';
import { logAudit } from '../../shared/services/auditService.ts';
import { currentUser, taskFilter, setTaskFilterValue, liveTasks, liveUsers, liveTimesheets, myTasks, user } from './state.ts';
import { toast, openModal, closeModal, MODAL_CLOSE_HOOKS } from './ui.ts';
import { loadLiveTasks, loadLiveTimesheets, loadLiveUsers } from './data.ts';
import { renderDashboard } from './dashboard.ts';

const TASK_PREVIEW_COUNT = 3;

function applyTaskFilters(tasks) {
  const q        = document.getElementById('task-search').value.trim().toLowerCase();
  const priority = document.getElementById('task-priority-filter').value;
  const type     = document.getElementById('task-type-filter').value;
  const sort     = document.getElementById('task-sort').value;

  let out = tasks;
  if (q) out = out.filter(t =>
    (t.title || '').toLowerCase().includes(q) ||
    (t.description || '').toLowerCase().includes(q)
  );
  if (priority !== 'all') out = out.filter(t => t.priority === priority);
  if (type !== 'all') out = out.filter(t => t.output_type === type);

  const byNewest = (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0);
  if (sort === 'newest')      out = [...out].sort(byNewest);
  else if (sort === 'oldest') out = [...out].sort((a, b) => byNewest(b, a));
  else if (sort === 'due')    out = [...out].sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
  return out;
}

// Single-status grids render in pages so a big backlog never floods the DOM
export const taskPager = createPager(45, () => renderTasks());

attachFilterToolbar(['task-search', 'task-priority-filter', 'task-type-filter', 'task-sort'], () => {
  taskPager.reset();
  renderTasks();
});

export function isOverdue(t) {
  return !!t.due_date && !['completed', 'reviewed'].includes(t.status) && t.due_date < todayISO();
}

function dueLabel(t) {
  if (!t.due_date) return '<div class="kan-card-meta">No due date</div>';
  return isOverdue(t)
    ? `<div class="kan-card-meta kan-overdue">⚠ Overdue — was due ${formatDateShort(t.due_date)}</div>`
    : `<div class="kan-card-meta">Due ${formatDateShort(t.due_date)}</div>`;
}

function taskCard(t, i = 0) {
  return `
    <div class="kan-card stagger-item" style="--i:${i}" data-action="open-task" data-id="${t.id}">
      <div class="kan-card-title">${escapeHtml(t.title)}</div>
      <div class="kan-card-desc">${escapeHtml(t.description)}</div>
      <div>${pBadge(t.priority)}</div>
      ${dueLabel(t)}
    </div>`;
}

export async function renderTasks() {
  const allTasks = myTasks();
  const tasks = applyTaskFilters(allTasks);
  document.getElementById('task-count-label').textContent =
    tasks.length === allTasks.length
      ? `${allTasks.length} total tasks`
      : `${tasks.length} of ${allTasks.length} tasks`;

  // Group once; tab counts, columns, and the single-status view all read this
  const byStatus = {};
  KANBAN_COLS.forEach(col => { byStatus[col] = []; });
  tasks.forEach(t => { byStatus[t.status]?.push(t); });

  const tabs = ['all', ...KANBAN_COLS];
  document.getElementById('task-filters').innerHTML = tabs.map(t => {
    const label = t === 'all' ? 'All' : STATUS_LABELS[t];
    const count = t === 'all' ? tasks.length : byStatus[t].length;
    return `<button class="filter-tab${taskFilter===t ? ' active' : ''}" data-action="set-task-filter" data-filter="${t}">${label} (${count})</button>`;
  }).join('');

  const board = document.getElementById('kanban-board');

  if (taskFilter === 'all') {
    // Overview: one section per status, previewing a few tasks each
    board.className = 'kanban';
    board.innerHTML = KANBAN_COLS.map(col => {
      const colTasks = byStatus[col];
      const hiddenCount = colTasks.length - TASK_PREVIEW_COUNT;
      return `<div class="kan-col">
        <div class="kan-col-header">
          <div class="kan-dot" style="background:${STATUS_COLORS[col]}"></div>
          <span class="kan-col-title">${STATUS_LABELS[col]}</span>
          <span class="kan-count">${colTasks.length}</span>
        </div>
        ${colTasks.slice(0, TASK_PREVIEW_COUNT).map((t, i) => taskCard(t, i)).join('')}
        ${hiddenCount > 0 ? `<button class="kan-more-btn" data-action="set-task-filter" data-filter="${col}">View more (${hiddenCount})</button>` : ''}
      </div>`;
    }).join('');
  } else {
    // Single status: full-width grid of task cards, paged
    const colTasks = byStatus[taskFilter] ?? [];
    const visible = colTasks.slice(0, taskPager.limit);
    board.className = colTasks.length ? 'task-grid' : '';
    board.innerHTML = colTasks.length
      ? visible.map((t, i) => taskCard(t, i)).join('') +
        (colTasks.length > visible.length
          ? `<button class="kan-more-btn" data-action="task-load-more" style="grid-column:1/-1">Load more (showing ${visible.length} of ${colTasks.length})</button>`
          : '')
      : emptyStateHTML('', `No ${STATUS_LABELS[taskFilter].toLowerCase()} tasks yet.`);
  }
}

export async function setTaskFilter(f) {
  setTaskFilterValue(f);
  taskPager.reset();
  await renderTasks();
}


export function openTaskDetail(id) {
  const t = liveTasks.find(x=>x.id===id);
  if(!t) return;
  const intern = user(t.assigned_to);
  const isMyTask = t.assigned_to===currentUser.id;
  const isIntern = currentUser.role==='intern';
  const isSup = currentUser.role==='supervisor'||currentUser.role==='admin';

  let actions = '';
  if(currentUser.role==='admin' && t.status!=='reviewed'){
    actions += `<button class="btn-action" style="background:#f3f4f6;color:#374151" data-action="edit-task" data-id="${id}">✎ Edit Task</button>`;
    actions += `<button class="btn-action" style="background:#fef2f2;color:#ef4444" data-action="delete-task" data-id="${id}">🗑 Delete Task</button>`;
  }
  if(isIntern && isMyTask){
    if(t.status==='assigned') actions += `<button class="btn-action" style="background:#fffbeb;color:#f59e0b" data-action="task-action" data-id="${id}" data-task-action="acknowledge">Acknowledge Task</button>`;
    if(t.status==='acknowledged') actions += `<button class="btn-action" style="background:#eff6ff;color:#3b82f6" data-action="task-action" data-id="${id}" data-task-action="start">Start Task</button>`;
    if(t.status==='in_progress') actions += `<button class="btn-action" style="background:#ecfdf5;color:#10b981" data-action="task-action" data-id="${id}" data-task-action="complete">Mark Complete</button>`;
  }
  if(isSup && t.status==='completed'){
    actions += `<button class="btn-action" style="background:#f5f3ff;color:#8b5cf6;margin-left:8px" data-action="task-action" data-id="${id}" data-task-action="review">Mark Reviewed</button>`;
  }
  if(t.status === 'reviewed'){
    actions = '<div style="font-size:12px;color:var(--faint);padding:8px 0">✓ This task has been reviewed and is now locked.</div>';
  }

  document.getElementById('modal-task-body').innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">${badge(t.status)} ${pBadge(t.priority)}</div>
    <h3 style="margin:0 0 10px;font-size:18px;font-weight:800;color:#252f27">${escapeHtml(t.title)}</h3>
    <p style="margin:0 0 14px;color:#374151;font-size:13px;line-height:1.6">${escapeHtml(t.description)}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;background:#f9fafb;border-radius:8px;padding:14px;margin-bottom:14px">
      ${[['Assigned to',intern.name||'—'],['Assigned by',user(t.assigned_by).name||'—'],['Due Date',formatDateShort(t.due_date)],['Created',formatDateShort(t.created_at?.slice(0,10))],['Category',t.industry_category],['Output Type',t.output_type||'—']].map(([k,v])=>`
        <div><div style="font-size:11px;color:var(--faint);font-weight:600;margin-bottom:2px">${k}</div><div class="text-base text-bold text-ink">${v}</div></div>`).join('')}
    </div>
    ${(t.skills||[]).length ? `<div style="margin-bottom:12px"><div class="meta-label">SKILLS TAGGED</div><div class="flex-wrap">${t.skills.map(skillPill).join('')}</div></div>` : ''}
    ${(currentUser.role === 'intern' && t.assigned_to === currentUser.id && ['in_progress'].includes(t.status)) ? `
  <div style="margin-bottom:12px">
    <div style="font-size:11px;color:var(--faint);font-weight:600;margin-bottom:4px">
      OUTPUT LINK ${['code','design','video','landing_page'].includes(t.output_type) ? '<span style="color:#ef4444">*required</span>' : '(optional)'}
    </div>
    <input class="form-input" id="task-output-link" placeholder="Paste Google Drive, GitHub, or Figma URL…" value="${t.output_link||''}" style="width:100%;padding:8px 10px;border:1.5px solid #e5e7eb;border-radius:6px;font-size:12px;font-family:inherit"/>
  </div>` : 
  t.output_link ? `<div style="margin-bottom:12px"><div style="font-size:11px;color:var(--faint);font-weight:600;margin-bottom:4px">OUTPUT LINK</div><a href="${t.output_link}" target="_blank" class="link-gold">${t.output_link}</a></div>` : ''}
    ${actions ? `<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">${actions}</div>` : ''}
  `;
  openModal('modal-view-task');
}

export async function handleDeleteTask(id) {
  const t = liveTasks.find(x => x.id === id);
  if (!t) return;
  // Timesheets reference tasks by FK — deleting a task with logged hours
  // would orphan those entries (the DB rejects it anyway). Refresh the cache
  // first: the Tasks page doesn't reload timesheets, so it can be stale.
  await loadLiveTimesheets();
  if (liveTimesheets.some(ts => ts.task_id === id)) {
    toast('Cannot delete — timesheet hours are logged against this task.');
    return;
  }
  if (!confirm(`Delete task “${t.title}”? This cannot be undone.`)) return;

  const ok = await deleteTask(id);
  if (!ok) { toast('Could not delete — it may have hours logged against it, or the task is locked.'); return; }

  logAudit('task_deleted', 'task', id, { title: t.title }, currentUser.id);
  closeModal('modal-view-task');
  toast('Task deleted.');
  await loadLiveTasks();
  await renderTasks();
  await renderDashboard();
}

export async function taskAction(id, action) {
  const task = liveTasks.find(t => t.id === id);

  if (task?.status === 'reviewed') {
    toast('This task is locked — reviewed tasks cannot be changed.');
    return;
  }

  if (action === 'complete') {
    const linkInput = document.getElementById('task-output-link');
    const outputLink = linkInput ? linkInput.value.trim() : (task?.output_link || '');

    const requiresLink = ['code', 'design', 'video', 'landing_page'].includes(task?.output_type);
    const hasLink = outputLink !== '';

    if (requiresLink && !hasLink) {
      toast('⚠️ Please paste an output link before marking this task complete.');
      return;
    }

    if (outputLink) {
      const result = await updateTask(id, { output_link: outputLink });
      if (!result) return;
    }
  }

  const statusMap = {acknowledge:'acknowledged', start:'in_progress', complete:'completed', review:'reviewed'};
  const newStatus = statusMap[action];
  if (!newStatus) return;

  const result = await updateTask(id, { status: newStatus, updated_at: new Date().toISOString() });
  if (!result) return;

  // fire-and-forget: logAudit handles its own errors; don't stall the UI on it
  logAudit('task_status_changed', 'task', id, { new_status: newStatus, action }, currentUser.id);

  closeModal('modal-view-task');
  toast('Task updated!');
  await loadLiveTasks();
  await renderTasks();
  await renderDashboard();
}

// ── Create / Edit Task modal ──────────────────────────────
let editingTaskId = null;

// Any close path must clear edit mode — a stale editingTaskId would make a
// later submit update the wrong task
MODAL_CLOSE_HOOKS['modal-add-task'] = () => {
  if (editingTaskId) {
    editingTaskId = null;
    setTaskModalMode(false);
  }
};

function setTaskModalMode(editing) {
  document.getElementById('modal-add-task-title').textContent = editing ? 'Edit Task' : 'Create New Task';
  document.getElementById('nt-submit-btn').textContent = editing ? 'Save Changes' : 'Create Task';
}

function clearTaskModal() {
  ['nt-title','nt-desc','nt-due'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('nt-assignee').value = '';
  document.getElementById('nt-priority').value = 'medium';
  document.getElementById('nt-cat').value = '';
  document.getElementById('nt-outtype').value = '';
  resetSkillPicker('nt-skills-picker');
  [...document.getElementById('nt-skills').options].forEach(o => { o.selected = false; });
}

export function openCreateTask() {
  editingTaskId = null;
  setTaskModalMode(false);
  clearTaskModal();
  openModal('modal-add-task');
}

export function openEditTask(id) {
  const t = liveTasks.find(x => x.id === id);
  if (!t) return;
  editingTaskId = id;
  setTaskModalMode(true);
  clearTaskModal();
  document.getElementById('nt-title').value    = t.title || '';
  document.getElementById('nt-desc').value     = t.description || '';
  document.getElementById('nt-assignee').value = t.assigned_to || '';
  document.getElementById('nt-priority').value = t.priority || 'medium';
  document.getElementById('nt-due').value      = t.due_date || '';
  document.getElementById('nt-cat').value      = t.industry_category || '';
  document.getElementById('nt-outtype').value  = t.output_type || '';
  const picker = document.getElementById('nt-skills-picker');
  const select = document.getElementById('nt-skills');
  (t.skills || []).forEach(s => {
    picker.querySelector(`.skill-tag[data-value="${s}"]`)?.classList.add('selected');
    [...select.options].forEach(o => { if (o.value === s) o.selected = true; });
  });
  closeModal('modal-view-task', () => openModal('modal-add-task'));
}

export async function populateAddTaskModal() {
  if (liveUsers.length === 0) await loadLiveUsers();
  const intern_select = document.getElementById('nt-assignee');
  intern_select.innerHTML = '<option value="">Select intern…</option>' +
    liveUsers.filter(u=>u.role==='intern').map(u=>`<option value="${u.id}">${u.name}</option>`).join('');
  renderSkillPicker('nt-skills-picker', 'nt-skills');
}

export async function handleCreateTask() {
  const title = document.getElementById('nt-title').value.trim();
  const assignee = document.getElementById('nt-assignee').value;
  const err = validateRequired(title, 'Title') || validateRequired(assignee, 'Assignee');
  if (err) { toast(err, 'error'); return; }

  const skillsEl = document.getElementById('nt-skills');
  const skills = [...skillsEl.selectedOptions].map(o=>o.value);

  const fields = {
    title,
    description:       document.getElementById('nt-desc').value,
    assigned_to:       assignee,
    priority:          document.getElementById('nt-priority').value,
    due_date:          document.getElementById('nt-due').value || null,
    industry_category: document.getElementById('nt-cat').value,
    output_type:       document.getElementById('nt-outtype').value || null,
    skills,
  };

  const wasEditing = !!editingTaskId;
  if (wasEditing) {
    const result = await updateTask(editingTaskId, { ...fields, updated_at: new Date().toISOString() });
    if (!result) return;
    logAudit('task_edited', 'task', editingTaskId, { title }, currentUser.id);
    editingTaskId = null;
  } else {
    const result = await createTask({
      ...fields,
      assigned_by: currentUser.id,
      status:      'assigned',
      output_link: '',
    });
    if (!result) return;
    logAudit('task_created', 'task', result.id, { title, assigned_to: user(assignee).name || assignee }, currentUser.id);
  }

  closeModal('modal-add-task');
  toast(wasEditing ? 'Task updated!' : 'Task created!');
  setTaskModalMode(false);
  clearTaskModal();
  await loadLiveTasks();
  await renderTasks();
  await renderDashboard();
}
