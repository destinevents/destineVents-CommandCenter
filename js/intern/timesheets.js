async function renderTimesheets() {
  const sheets = mySheets();
  const isAdmin = currentUser.role!=='intern';

  const approvedH = sheets.filter(t=>t.status==='approved').reduce((s,t)=>s+t.hours,0);
  const pendingH  = sheets.filter(t=>t.status==='pending').reduce((s,t)=>s+t.hours,0);
  document.getElementById('sheet-stats').innerHTML = [
    {icon:'✅',label:'Approved Hours',value:approvedH+'h',color:'#10b981'},
    {icon:'⏳',label:'Pending Hours', value:pendingH+'h',color:'#f59e0b'},
    {icon:'📅',label:'Total Entries', value:sheets.length, color:'#252f27'},
  ].map(s=>`<div class="stat-card"><div class="sc-top"><span class="sc-icon">${s.icon}</span></div><div class="sc-val" style="color:${s.color}">${s.value}</div><div class="sc-label">${s.label}</div></div>`).join('');

  document.getElementById('sheet-filters').innerHTML = ['all','pending','approved','rejected'].map(f=>`
    <button class="filter-tab${sheetFilter===f?' active':''}" data-action="set-sheet-filter" data-filter="${f}">${f.charAt(0).toUpperCase()+f.slice(1)}</button>`).join('');

  const filtered = sheetFilter==='all' ? sheets : sheets.filter(t=>t.status===sheetFilter);

  const adminCols = isAdmin ? ['<th>Intern</th>','<th>Date</th>','<th>Task</th>','<th>Activity</th>','<th>Hours</th>','<th>Category</th>','<th>Skills</th>','<th>Status</th>','<th></th>'] :
                              ['<th>Date</th>','<th>Task</th>','<th>Activity</th>','<th>Hours</th>','<th>Category</th>','<th>Skills</th>','<th>Status</th>'];
  document.getElementById('sheet-thead').innerHTML = `<tr>${adminCols.join('')}</tr>`;

  document.getElementById('sheet-tbody').innerHTML = filtered.map(ts=>{
    const task = liveTasks.find(t=>t.id===ts.task_id);
    const intern = liveUsers.find(u=>u.id===ts.intern_id);
    const approveBtn = ts.status==='pending' ? `<div style="display:flex;gap:5px"><button class="btn-sm-approve" data-action="approve-sheet" data-id="${ts.id}">✓ Approve</button><button class="btn-sm-reject" data-action="reject-sheet" data-id="${ts.id}">✕ Reject</button></div>` : '';
    const skillHtml = (ts.skills||[]).slice(0,2).map(skillPillGreen).join(' ')+((ts.skills||[]).length>2?`<span style="font-size:10px;color:var(--faint)">+${ts.skills.length-2}</span>`:'');
    return `<tr>
      ${isAdmin?`<td><div class="flex-gap-8">${avatarEl(intern?.avatar||'?',24)}<span class="text-bold">${escapeHtml(intern?.name)||'—'}</span></div></td>`:''}
      <td style="white-space:nowrap;color:#374151">${ts.date}</td>
      <td style="color:#374151">${escapeHtml(task?.title)||'<span style="color:var(--faint)">—</span>'}</td>
      <td class="truncate text-ink">${escapeHtml(ts.activity_description)}</td>
      <td class="hours-display">${ts.hours}h</td>
      <td class="text-muted">${ts.industry_category}</td>
      <td>${skillHtml}</td>
      <td>${badge(ts.status)}${ts.status === 'rejected' && ts.rejection_reason ? `<div style="font-size:10px;color:#ef4444;margin-top:3px;max-width:180px;line-height:1.3">${escapeHtml(ts.rejection_reason)}</div>` : ''}</td>
      ${isAdmin?`<td>${approveBtn}</td>`:''}
    </tr>`;
  }).join('');

  document.getElementById('sheet-empty').style.display = filtered.length ? 'none' : 'block';

  const lhTask = document.getElementById('lh-task');
  lhTask.innerHTML = '<option value="">None</option>' +
    myTasks().map(t=>`<option value="${t.id}">${escapeHtml(t.title)}</option>`).join('');
  document.getElementById('lh-skills').innerHTML = SKILL_LIST.map(s=>`<option value="${s}">${s}</option>`).join('');
}

async function setSheetFilter(f) { sheetFilter = f; await renderTimesheets(); }

async function approveSheet(id) {
  const { error } = await updateTimesheet(id, {
    status: 'approved',
    approved_by: currentUser.id,
    approved_at: new Date().toISOString()
  });

  if (error) { toast('Error approving entry: ' + error.message); return; }

  await logAudit('approved_timesheet', 'timesheet', id, { approved_by: currentUser.id });

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
  const { error } = await updateTimesheet(pendingRejectId, {
    status: 'rejected',
    rejection_reason: reason
  });
  if (!error) {
    await logAudit('rejected_timesheet', 'timesheet', pendingRejectId, { reason });
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

  const { error } = await createTimesheet({
    intern_id:            currentUser.id,
    date,
    hours,
    task_id:              taskId,
    activity_description: activity,
    industry_category:    document.getElementById('lh-cat').value,
    skills,
    status:               'pending'
  });

  if (error) {
    if (logBtn) { logBtn.disabled = false; logBtn.textContent = 'Save Entry'; }
    toast('Error logging hours: ' + error.message);
    return;
  }

  closeModal('modal-log-hours');
  if (logBtn) { logBtn.disabled = false; logBtn.textContent = 'Save Entry'; }
  toast('Hours logged! Pending approval.');
  ['lh-date','lh-hours','lh-activity'].forEach(id => document.getElementById(id).value = '');
  await updateBadges();
  await renderTimesheets();
  await renderDashboard();
}
