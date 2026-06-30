async function renderTasks() {
  const tasks = myTasks();
  document.getElementById('task-count-label').textContent = `${tasks.length} total tasks`;

  document.getElementById('kanban-board').innerHTML = KANBAN_COLS.map(col=>{
    const colTasks = tasks.filter(t=>t.status===col);
    return `<div class="kan-col">
      <div class="kan-col-header">
        <div class="kan-dot" style="background:${STATUS_COLORS[col]}"></div>
        <span class="kan-col-title">${STATUS_LABELS[col]}</span>
        <span class="kan-count">${colTasks.length}</span>
      </div>
      ${colTasks.map(t=>`
        <div class="kan-card" data-action="open-task" data-id="${t.id}">
          <div class="kan-card-title">${escapeHtml(t.title)}</div>
          <div class="kan-card-desc">${escapeHtml(t.description)}</div>
          <div>${pBadge(t.priority)}</div>
          <div class="kan-card-meta">Due ${t.due_date}</div>
        </div>`).join('')}
    </div>`;
  }).join('');
}


function openTaskDetail(id) {
  const t = liveTasks.find(x=>x.id===id);
  if(!t) return;
  const intern = user(t.assigned_to);
  const isMyTask = t.assigned_to===currentUser.id;
  const isIntern = currentUser.role==='intern';
  const isSup = currentUser.role==='supervisor'||currentUser.role==='admin';

  let actions = '';
  if(isIntern && isMyTask){
    if(t.status==='assigned') actions = `<button class="btn-action" style="background:#fffbeb;color:#f59e0b" data-action="task-action" data-id="${id}" data-task-action="acknowledge">Acknowledge Task</button>`;
    if(t.status==='acknowledged') actions = `<button class="btn-action" style="background:#eff6ff;color:#3b82f6" data-action="task-action" data-id="${id}" data-task-action="start">Start Task</button>`;
    if(t.status==='in_progress') actions = `<button class="btn-action" style="background:#ecfdf5;color:#10b981" data-action="task-action" data-id="${id}" data-task-action="complete">Mark Complete</button>`;
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
      ${[['Assigned to',intern.name||'—'],['Due Date',t.due_date],['Category',t.industry_category],['Output Type',t.output_type||'—']].map(([k,v])=>`
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

async function taskAction(id, action) {
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

  await logAudit('task_status_changed', 'task', id, { new_status: newStatus, action }, currentUser.id);

  closeModal('modal-view-task');
  toast('Task updated!');
  await renderTasks();
  await renderDashboard();
}

async function populateAddTaskModal() {
  if (liveUsers.length === 0) await loadLiveUsers();
  const intern_select = document.getElementById('nt-assignee');
  intern_select.innerHTML = '<option value="">Select intern…</option>' +
    liveUsers.filter(u=>u.role==='intern').map(u=>`<option value="${u.id}">${u.name}</option>`).join('');
  const skills_select = document.getElementById('nt-skills');
  skills_select.innerHTML = SKILL_LIST.map(s=>`<option value="${s}">${s}</option>`).join('');
}

async function createTask() {
  const title = document.getElementById('nt-title').value.trim();
  const assignee = document.getElementById('nt-assignee').value;
  const err = validateRequired(title, 'Title') || validateRequired(assignee, 'Assignee');
  if (err) { toast(err, 'error'); return; }

  const skillsEl = document.getElementById('nt-skills');
  const skills = [...skillsEl.selectedOptions].map(o=>o.value);

  const newTask = {
    title,
    description:       document.getElementById('nt-desc').value,
    assigned_to:       assignee,
    assigned_by:       currentUser.id,
    priority:          document.getElementById('nt-priority').value,
    status:            'assigned',
    due_date:          document.getElementById('nt-due').value || null,
    industry_category: document.getElementById('nt-cat').value,
    output_type:       document.getElementById('nt-outtype').value || null,
    skills,
    output_link:       ''
  };

  const result = await createTask(newTask);
  if (!result) return;

  closeModal('modal-add-task');
  toast('Task created!');
  ['nt-title','nt-desc','nt-due'].forEach(id => document.getElementById(id).value = '');
  await renderTasks();
  await renderDashboard();
}
