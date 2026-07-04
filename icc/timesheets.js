// Render the table in pages so hundreds of rows never hit the DOM at once
const SHEET_PAGE_SIZE = 50;
let sheetRenderLimit = SHEET_PAGE_SIZE;

function loadMoreSheets() {
  sheetRenderLimit += SHEET_PAGE_SIZE;
  renderTimesheets();
}

attachFilterToolbar(['sheet-search', 'sheet-from', 'sheet-to'], () => {
  sheetRenderLimit = SHEET_PAGE_SIZE;
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

async function renderTimesheets() {
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
  const visible = filtered.slice(0, sheetRenderLimit);

  const adminCols = isAdmin ? ['<th>Intern</th>','<th>Date</th>','<th>Task</th>','<th>Activity</th>','<th>Hours</th>','<th>Category</th>','<th>Skills</th>','<th>Status</th>','<th></th>'] :
                              ['<th>Date</th>','<th>Task</th>','<th>Activity</th>','<th>Hours</th>','<th>Category</th>','<th>Skills</th>','<th>Status</th>','<th></th>'];
  document.getElementById('sheet-thead').innerHTML = `<tr>${adminCols.join('')}</tr>`;

  document.getElementById('sheet-tbody').innerHTML = visible.map(ts=>{
    const task = taskById.get(ts.task_id);
    const intern = userById.get(ts.intern_id);
    // Approved entries are locked (spec §4.1); pending/rejected can be removed
    const canDelete = ['pending','rejected'].includes(ts.status) && (isAdmin || ts.intern_id === currentUser.id);
    const delBtn = canDelete ? `<button class="btn-sm-reject" data-action="delete-sheet" data-id="${ts.id}" title="Delete entry">🗑</button>` : '';
    const approveBtn = ts.status==='pending' && isAdmin ? `<button class="btn-sm-approve" data-action="approve-sheet" data-id="${ts.id}">✓ Approve</button><button class="btn-sm-reject" data-action="reject-sheet" data-id="${ts.id}">✕ Reject</button>` : '';
    const skillHtml = (ts.skills||[]).slice(0,2).map(skillPillGreen).join(' ')+((ts.skills||[]).length>2?`<span style="font-size:10px;color:var(--faint)">+${ts.skills.length-2}</span>`:'');
    return `<tr>
      ${isAdmin?`<td><div class="flex-gap-8">${avatarEl(intern?.avatar||'?',24)}<span class="text-bold">${escapeHtml(intern?.name)||'—'}</span></div></td>`:''}
      <td style="white-space:nowrap;color:#374151">${ts.date}</td>
      <td style="color:#374151">${escapeHtml(task?.title)||'<span class="no-task-flag" title="Entry is not linked to a task">⚠ no task</span>'}</td>
      <td class="truncate text-ink">${escapeHtml(ts.activity_description)}</td>
      <td class="hours-display">${ts.hours}h</td>
      <td class="text-muted">${ts.industry_category}</td>
      <td>${skillHtml}</td>
      <td>${badge(ts.status)}${ts.status === 'rejected' && ts.rejection_reason ? `<div style="font-size:10px;color:#ef4444;margin-top:3px;max-width:180px;line-height:1.3">${escapeHtml(ts.rejection_reason)}</div>` : ''}</td>
      <td><div style="display:flex;gap:5px">${approveBtn}${delBtn}</div></td>
    </tr>`;
  }).join('');

  document.getElementById('sheet-empty').style.display = filtered.length ? 'none' : 'block';
  document.getElementById('sheet-more').innerHTML = filtered.length > visible.length
    ? `<button class="kan-more-btn" data-action="sheet-load-more" style="width:calc(100% - 20px);margin:10px">Load more (showing ${visible.length} of ${filtered.length})</button>`
    : '';

  const lhTask = document.getElementById('lh-task');
  lhTask.innerHTML = '<option value="">Not linked to a task</option>' +
    myTasks().map(t=>`<option value="${t.id}">${escapeHtml(t.title)}</option>`).join('');
  renderSkillPicker('lh-skills-picker', 'lh-skills');
}

async function setSheetFilter(f) { sheetFilter = f; await renderTimesheets(); }

async function approveSheet(id) {
  const result = await updateTimesheet(id, {
    status: 'approved',
    approved_by: currentUser.id,
    approved_at: new Date().toISOString()
  });
  if (!result) return;

  logAudit('approved_timesheet', 'timesheet', id, { approved_by: currentUser.id }, currentUser.id);

  toast('Entry approved ✓');
  await updateBadges();
  await renderTimesheets();
  await renderDashboard();
}

function rejectSheet(id) {
  pendingRejectId = id;
  document.getElementById('reject-reason-input').value = '';
  openModal('modal-reject-reason');
}

async function confirmReject() {
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
    await updateBadges();
    await loadLiveTimesheets();
    await renderPage(activePage);
    toast('Entry rejected — intern will see the reason.');
  } else {
    toast('Error rejecting entry. Please try again.');
  }
}

async function deleteSheet(id) {
  const ts = liveTimesheets.find(s => s.id === id);
  if (!ts) return;
  if (!confirm(`Delete the ${ts.hours}h entry for ${ts.date}? This cannot be undone.`)) return;

  const ok = await deleteTimesheet(id);
  if (!ok) { toast('Could not delete the entry. Please try again.'); return; }

  logAudit('timesheet_deleted', 'timesheet', id, { date: ts.date, hours: ts.hours }, currentUser.id);
  toast('Entry deleted.');
  await loadLiveTimesheets();
  await updateBadges();
  await renderTimesheets();
  await renderDashboard();
}

async function logHours() {
  const date     = document.getElementById('lh-date').value;
  const hours    = parseFloat(document.getElementById('lh-hours').value);
  const activity = document.getElementById('lh-activity').value.trim();
  if(!date||!hours||!activity) { toast('Please fill in required fields'); return; }

  const existingEntries = liveTimesheets.filter(ts => ts.date === date && ts.intern_id === currentUser.id);
  if (existingEntries.length > 0) {
    const existingHours = existingEntries.reduce((s, t) => s + t.hours, 0);
    const confirmed = confirm(
      `⚠️ You already have ${existingHours}h logged for ${date}.\n\nDo you want to add another entry for the same date?`
    );
    if (!confirmed) return;
  }

  const existingHoursToday = liveTimesheets
    .filter(ts => ts.date === date && ts.intern_id === currentUser.id)
    .reduce((s, t) => s + t.hours, 0);
  const totalIfAdded = existingHoursToday + hours;
  if (totalIfAdded > 8) {
    toast(`⚠️ Cannot log ${hours}h — total for ${date} would be ${totalIfAdded}h (max is 8h per day).`);
    return;
  }

  const logBtn = document.getElementById('log-hours-btn');
  if (logBtn) { logBtn.disabled = true; logBtn.textContent = 'Saving…'; }

  const skillsEl = document.getElementById('lh-skills');
  const skills   = [...skillsEl.selectedOptions].map(o=>o.value);
  const taskId   = document.getElementById('lh-task').value || null;

  const result = await createTimesheet({
    intern_id:            currentUser.id,
    date,
    hours,
    task_id:              taskId,
    activity_description: activity,
    industry_category:    document.getElementById('lh-cat').value,
    skills,
    status:               'pending'
  });

  if (!result) {
    if (logBtn) { logBtn.disabled = false; logBtn.textContent = 'Save Entry'; }
    return;
  }

  logAudit('hours_logged', 'timesheet', result.id, { date, hours }, currentUser.id);

  closeModal('modal-log-hours');
  if (logBtn) { logBtn.disabled = false; logBtn.textContent = 'Save Entry'; }
  toast('Hours logged! Pending approval.');
  ['lh-date','lh-hours','lh-activity'].forEach(id => document.getElementById(id).value = '');
  resetSkillPicker('lh-skills-picker');
  await updateBadges();
  await renderTimesheets();
  await renderDashboard();
}
