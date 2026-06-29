// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const SKILL_LIST = [
  "Web Development","Backend Development","Database Design","Automation",
  "Debugging","Graphic Design","Video Editing","Content Creation",
  "Communication","Problem Solving"
];

// ─── STATE ───────────────────────────────────────────────────────────────────
let currentUser = {};
let activePage = "dashboard";
let taskFilter = "all";
let sheetFilter = "all";
let sidebarOpen = true;
let pendingRejectId = null;

// Live data — loaded from Supabase on each page render
let liveUsers = [];
let liveTasks = [];
let liveTimesheets = [];

const STATUS_LABELS = { assigned:"Assigned", acknowledged:"Acknowledged", in_progress:"In Progress", completed:"Completed", reviewed:"Reviewed", pending:"Pending", approved:"Approved", rejected:"Rejected" };
const STATUS_COLORS = { assigned:"#6366f1", acknowledged:"#f59e0b", in_progress:"#3b82f6", completed:"#10b981", reviewed:"#8b5cf6", pending:"#f59e0b", approved:"#10b981", rejected:"#ef4444" };
const OUTPUT_ICONS  = { code:"💻", design:"🎨", video:"🎬", document:"📄", automation:"⚙️", landing_page:"🌐" };
const KANBAN_COLS   = ["assigned","acknowledged","in_progress","completed","reviewed"];

// ─── UTILS ───────────────────────────────────────────────────────────────────
function user(id){ return liveUsers.find(u=>u.id===id)||{}; }
function badge(val){ return `<span class="badge badge-${val}">${STATUS_LABELS[val]||val}</span>`; }
function pBadge(val){ return `<span class="badge badge-${val}">${val.charAt(0).toUpperCase()+val.slice(1)}</span>`; }
function avatarEl(initials, size=32, color="#252f27"){
  return `<div class="avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size*0.34)}px;background:${color}">${initials}</div>`;
}
function skillPill(s){ return `<span class="skill-pill">${s}</span>`; }
function skillPillGreen(s){ return `<span class="skill-pill-green">${s}</span>`; }
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2400);
}
function handleError(context, error) {
  console.error(`[${context}]`, error);
  toast(`Something went wrong: ${error?.message || 'Unknown error'}. Try refreshing.`);
}
function myTasks(){ return liveTasks; }
function mySheets(){ return liveTimesheets; }
function pendingApprovals(){ return liveTimesheets.filter(t=>t.status==='pending'); }

// ─── DATA LOADERS ────────────────────────────────────────────────────────────
async function loadLiveUsers() {
  const { data, error } = await sb.from('intern_users').select('*');
  if (error) { handleError('loadLiveUsers', error); return; }
  if (data) liveUsers = data;
}

async function loadLiveTasks() {
  const role = currentUser.role;
  let query = sb.from('intern_tasks').select('*').order('created_at', { ascending: false });
  if (role === 'intern') query = query.eq('assigned_to', currentUser.id);
  const { data, error } = await query;
  if (error) { handleError('loadLiveTasks', error); return; }
  if (data) liveTasks = data;
}

async function loadLiveTimesheets() {
  const role = currentUser.role;
  let query = sb.from('intern_timesheets').select('*').order('date', { ascending: false });
  if (role === 'intern') query = query.eq('intern_id', currentUser.id);
  const { data, error } = await query;
  if (error) { handleError('loadLiveTimesheets', error); return; }
  if (data) liveTimesheets = data;
}

async function logAudit(action, targetType, targetId, metadata = {}) {
  const { error } = await sb.from('intern_audit_logs').insert({
    action,
    performed_by: currentUser.id,
    target_type: targetType,
    target_id: targetId,
    metadata
  });
  if (error) console.error('[logAudit]', error);
}

// ─── UI HELPERS ──────────────────────────────────────────────────────────────
function applyRoleVisibility(){
  const isAdmin = currentUser.role==='admin';
  const isSup   = currentUser.role==='supervisor'||isAdmin;
  const isIntern= currentUser.role==='intern';
  document.querySelectorAll('.admin-only').forEach(el=>el.style.display=isAdmin?'':'none');
  document.querySelectorAll('.supervisor-only').forEach(el=>el.style.display=isSup?'':'none');
  document.querySelectorAll('.intern-only').forEach(el=>el.style.display=isIntern?'':'none');
}

// ─── NAVIGATION ──────────────────────────────────────────────────────────────
async function goPage(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+page)?.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b=>{
    b.classList.remove('active');
    b.innerHTML = b.innerHTML.includes('pip') ? b.innerHTML : b.innerHTML;
  });
  document.querySelectorAll('.nav-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.page===page);
    const pip = b.querySelector('.pip');
    if(pip) pip.style.display = b.classList.contains('active')?'block':'none';
  });
  activePage = page;
  const titles = {dashboard:"Dashboard",tasks:"Tasks",timesheets:"Timesheets",outputs:"Output Portfolio",approvals:"Approvals",interns:"Interns",reports:"Reports"};
  document.getElementById('topbar-title').textContent = titles[page]||page;
  await renderPage(page);
}

document.getElementById('sidebar-nav').addEventListener('click', async e=>{
  const btn = e.target.closest('.nav-btn');
  if(btn && btn.dataset.page) await goPage(btn.dataset.page);
});

document.addEventListener('click', async e=>{
  const el = e.target.closest('[data-action]');
  if(!el) return;
  const a = el.dataset.action;
  if(a==='signout') { e.preventDefault(); await handleSignOut(); return; }
  if(a==='toggle-sidebar') { toggleSidebar(); return; }
  if(a==='go-page') { await goPage(el.dataset.page); return; }
  if(a==='open-modal') { openModal(el.dataset.modal); return; }
  if(a==='close-modal') { closeModal(el.dataset.modal); return; }
  if(a==='create-task') { await createTask(); return; }
  if(a==='log-hours') { await logHours(); return; }
  if(a==='confirm-reject') { confirmReject(); return; }
  if(a==='set-task-filter') { setTaskFilter(el.dataset.filter); return; }
  if(a==='set-sheet-filter') { setSheetFilter(el.dataset.filter); return; }
  if(a==='open-task') { openTaskDetail(el.dataset.id); return; }
  if(a==='task-action') { taskAction(el.dataset.id, el.dataset.taskAction); return; }
  if(a==='approve-sheet') { await approveSheet(el.dataset.id); return; }
  if(a==='reject-sheet') { rejectSheet(el.dataset.id); return; }
  if(a==='export-excel') { exportExcel(el.dataset.id); return; }
  if(a==='export-pdf') { exportPDF(el.dataset.id); return; }
});

// Sidebar
function toggleSidebar(){
  sidebarOpen = !sidebarOpen;
  const sidebarEl = document.getElementById('sidebar');
  sidebarEl.classList.toggle('collapsed', !sidebarOpen);
  document.querySelector('.sb-collapse').textContent = sidebarOpen ? '◀' : '▶';
}

// Badges
async function updateBadges(){
  await loadLiveTimesheets();
  const count = pendingApprovals().length;
  document.getElementById('approval-badge').textContent = count;
  document.getElementById('approval-badge').style.display = count>0?'inline':'none';
  const nb = document.getElementById('notif-btn');
  if(nb){ nb.style.display = (currentUser.role!=='intern'&&count>0)?'flex':'none'; }
  document.getElementById('notif-count').textContent = count;
}

// Modals
function openModal(id){ document.getElementById(id).classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(m=>{
  m.addEventListener('click', e=>{ if(e.target===m) m.classList.remove('open'); });
});

// Render dispatcher
async function renderPage(page){
  const map = {
    dashboard: renderDashboard,
    tasks:     renderTasks,
    timesheets:renderTimesheets,
    outputs:   renderOutputs,
    approvals: renderApprovals,
    interns:   renderInterns,
    reports:   renderReports,
  };

  const pageEl = document.getElementById('page-' + page);
  if (pageEl) {
    pageEl.innerHTML = `<div class="page-loading"><div class="spinner"></div><div class="loading-text">Loading…</div></div>`;
  }

  try {
    await loadLiveTasks();
    await loadLiveTimesheets();
    await loadLiveUsers();
    const fn = map[page];
    if (fn) await fn();
  } catch (err) {
    handleError('renderPage:' + page, err);
    if (pageEl) {
      pageEl.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div>Failed to load page. Please refresh.</div>`;
    }
  }
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
async function renderDashboard(){
  const first = currentUser.name.split(' ')[0];
  document.getElementById('dash-greeting').textContent = `Good day, ${first} 👋`;
  document.getElementById('dash-date').textContent = new Date().toLocaleDateString('en-PH',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

  const sheets = mySheets();
  const tasks  = myTasks();
  const approvedHours = sheets.filter(t=>t.status==='approved').reduce((s,t)=>s+t.hours,0);
  const activeTasks   = tasks.filter(t=>!['completed','reviewed'].includes(t.status)).length;
  const doneTasks     = tasks.filter(t=>['completed','reviewed'].includes(t.status)).length;
  const pending       = pendingApprovals().length;

  const statsData = [
    {icon:'⏰', label:'Approved Hours',   value:approvedHours+'h', sub:'Total',      color:'#252f27'},
    {icon:'📋', label:'Active Tasks',     value:activeTasks,       sub:'In progress',color:'#C9A84C'},
    {icon:'✅', label:'Tasks Completed',  value:doneTasks,         sub:'Done',       color:'#10b981'},
    ...(currentUser.role!=='intern'?[{icon:'🔔', label:'Pending Approvals', value:pending, sub:'Queue', color:'#f59e0b'}]:[]),
  ];
  document.getElementById('dash-stats').innerHTML = statsData.map(s=>`
    <div class="stat-card">
      <div class="sc-top"><span class="sc-icon">${s.icon}</span><span class="sc-sub">${s.sub}</span></div>
      <div class="sc-val" style="color:${s.color}">${s.value}</div>
      <div class="sc-label">${s.label}</div>
    </div>`).join('');

  // Recent tasks
  const recentTasks = tasks.slice(0,4);
  document.getElementById('dash-tasks-list').innerHTML = recentTasks.map(t=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f3f4f6;">
      <div>
        <div class="text-base text-bold text-ink">${escapeHtml(t.title)}</div>
        <div class="text-xs text-faint mt-2">${t.industry_category} · Due ${t.due_date}</div>
      </div>
      ${badge(t.status)}
    </div>`).join('') || '<div class="no-data">No tasks yet.</div>';

  // Skill heatmap
  const skillMap = {};
  sheets.filter(t=>t.status==='approved').forEach(ts=>(ts.skills||[]).forEach(s=>{ skillMap[s]=(skillMap[s]||0)+1; }));
  const entries = Object.entries(skillMap).sort((a,b)=>b[1]-a[1]);
  const max = entries.length ? Math.max(...entries.map(e=>e[1])) : 1;
  document.getElementById('dash-skills-chart').innerHTML = entries.length ? entries.map(([skill,count])=>`
    <div class="skill-bar-row">
      <div class="skill-bar-meta">
        <span style="font-size:12px;color:#374151;font-weight:500">${skill}</span>
        <span style="font-size:11px;color:var(--faint)">${count} entries</span>
      </div>
      <div class="skill-bar-track"><div class="skill-bar-fill" style="width:${(count/max)*100}%"></div></div>
    </div>`).join('') : '<div class="no-data">No approved entries yet.</div>';

  // Recent sheets
  const recentSheets = sheets.slice(-5).reverse();
  document.getElementById('dash-sheets-body').innerHTML = recentSheets.map(ts=>{
    const task = liveTasks.find(t=>t.id===ts.task_id);
    return `<tr>
      <td style="color:#374151;white-space:nowrap">${ts.date}</td>
      <td class="truncate text-ink">${escapeHtml(ts.activity_description)}</td>
      <td class="hours-display">${ts.hours}h</td>
      <td class="text-muted">${ts.industry_category}</td>
      <td>${badge(ts.status)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" class="no-data-center">No entries yet.</td></tr>';
}

// ─── TASKS ────────────────────────────────────────────────────────────────────
async function renderTasks(){
  const tasks = myTasks();
  document.getElementById('task-count-label').textContent = `${tasks.length} total tasks`;

  // Filter tabs
  const filters = ['all', ...KANBAN_COLS];
  document.getElementById('task-filters').innerHTML = filters.map(f=>`
    <button class="filter-tab${taskFilter===f?' active':''}" data-action="set-task-filter" data-filter="${f}">${f==='all'?'All':(STATUS_LABELS[f]||f)}</button>`).join('');

  // Kanban
  const filtered = taskFilter==='all' ? tasks : tasks.filter(t=>t.status===taskFilter);
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

async function setTaskFilter(f){ taskFilter=f; await renderTasks(); }

function openTaskDetail(id){
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

async function taskAction(id, action){
  const task = liveTasks.find(t => t.id === id);

  // Block any action on reviewed tasks
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
      const { error: linkError } = await sb.from('intern_tasks')
        .update({ output_link: outputLink })
        .eq('id', id);
      if (linkError) {
        toast('Error saving output link: ' + linkError.message);
        return;
      }
    }
  }

  const statusMap = {acknowledge:'acknowledged', start:'in_progress', complete:'completed', review:'reviewed'};
  const newStatus = statusMap[action];
  if (!newStatus) return;

  const { error } = await sb.from('intern_tasks')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) { toast('Error updating task: ' + error.message); return; }

  await logAudit('task_status_changed', 'task', id, { new_status: newStatus, action });

  closeModal('modal-view-task');
  toast('Task updated!');
  await renderTasks();
  await renderDashboard();
}

// Populate add task modal selects
async function populateAddTaskModal(){
  if (liveUsers.length === 0) await loadLiveUsers();
  const intern_select = document.getElementById('nt-assignee');
  intern_select.innerHTML = '<option value="">Select intern…</option>' +
    liveUsers.filter(u=>u.role==='intern').map(u=>`<option value="${u.id}">${u.name}</option>`).join('');
  const skills_select = document.getElementById('nt-skills');
  skills_select.innerHTML = SKILL_LIST.map(s=>`<option value="${s}">${s}</option>`).join('');
}

async function createTask(){
  const title    = document.getElementById('nt-title').value.trim();
  const assignee = document.getElementById('nt-assignee').value;
  if(!title || !assignee){ toast('Please fill in required fields'); return; }

  const skillsEl = document.getElementById('nt-skills');
  const skills   = [...skillsEl.selectedOptions].map(o=>o.value);

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

  const { error } = await sb.from('intern_tasks').insert(newTask);
  if (error) { toast('Error creating task: ' + error.message); return; }

  closeModal('modal-add-task');
  toast('Task created!');
  ['nt-title','nt-desc','nt-due'].forEach(id => document.getElementById(id).value = '');
  await renderTasks();
  await renderDashboard();
}

// ─── TIMESHEETS ───────────────────────────────────────────────────────────────
async function renderTimesheets(){
  const sheets = mySheets();
  const isAdmin = currentUser.role!=='intern';

  // Stats
  const approvedH = sheets.filter(t=>t.status==='approved').reduce((s,t)=>s+t.hours,0);
  const pendingH  = sheets.filter(t=>t.status==='pending').reduce((s,t)=>s+t.hours,0);
  document.getElementById('sheet-stats').innerHTML = [
    {icon:'✅',label:'Approved Hours',value:approvedH+'h',color:'#10b981'},
    {icon:'⏳',label:'Pending Hours', value:pendingH+'h',color:'#f59e0b'},
    {icon:'📅',label:'Total Entries', value:sheets.length, color:'#252f27'},
  ].map(s=>`<div class="stat-card"><div class="sc-top"><span class="sc-icon">${s.icon}</span></div><div class="sc-val" style="color:${s.color}">${s.value}</div><div class="sc-label">${s.label}</div></div>`).join('');

  // Filter tabs
  document.getElementById('sheet-filters').innerHTML = ['all','pending','approved','rejected'].map(f=>`
    <button class="filter-tab${sheetFilter===f?' active':''}" data-action="set-sheet-filter" data-filter="${f}">${f.charAt(0).toUpperCase()+f.slice(1)}</button>`).join('');

  const filtered = sheetFilter==='all' ? sheets : sheets.filter(t=>t.status===sheetFilter);

  // Table header
  const adminCols = isAdmin ? ['<th>Intern</th>','<th>Date</th>','<th>Task</th>','<th>Activity</th>','<th>Hours</th>','<th>Category</th>','<th>Skills</th>','<th>Status</th>','<th></th>'] :
                              ['<th>Date</th>','<th>Task</th>','<th>Activity</th>','<th>Hours</th>','<th>Category</th>','<th>Skills</th>','<th>Status</th>'];
  document.getElementById('sheet-thead').innerHTML = `<tr>${adminCols.join('')}</tr>`;

  // Rows
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

  // Populate log hours modal
  const lhTask = document.getElementById('lh-task');
  lhTask.innerHTML = '<option value="">None</option>' +
    myTasks().map(t=>`<option value="${t.id}">${escapeHtml(t.title)}</option>`).join('');
  document.getElementById('lh-skills').innerHTML = SKILL_LIST.map(s=>`<option value="${s}">${s}</option>`).join('');
}

async function setSheetFilter(f){ sheetFilter=f; await renderTimesheets(); }

async function approveSheet(id){
  const { error } = await sb.from('intern_timesheets')
    .update({
      status:      'approved',
      approved_by: currentUser.id,
      approved_at: new Date().toISOString()
    })
    .eq('id', id);

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
  const { error } = await sb.from('intern_timesheets')
    .update({
      status: 'rejected',
      rejection_reason: reason
    })
    .eq('id', pendingRejectId);
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

async function logHours(){
  const date     = document.getElementById('lh-date').value;
  const hours    = parseFloat(document.getElementById('lh-hours').value);
  const activity = document.getElementById('lh-activity').value.trim();
  if(!date||!hours||!activity){ toast('Please fill in required fields'); return; }

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

  const { error } = await sb.from('intern_timesheets').insert({
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

// ─── OUTPUTS ─────────────────────────────────────────────────────────────────
async function renderOutputs(){
  const tasks = myTasks().filter(t=>t.output_type);
  document.getElementById('outputs-grid').innerHTML = tasks.map(t=>{
    const intern = user(t.assigned_to);
    return `<div class="out-card">
      <div class="out-card-head">
        <span style="font-size:26px">${OUTPUT_ICONS[t.output_type]||'📦'}</span>
        <div>
          <div class="out-card-type">${t.output_type.replace('_',' ').toUpperCase()}</div>
          <div class="out-card-cat">${t.industry_category}</div>
        </div>
      </div>
      <div class="out-card-body">
        <div class="out-card-name">${escapeHtml(t.title)}</div>
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:9px">${avatarEl(intern.avatar||'?',20)}<span style="font-size:11px;color:var(--muted)">${escapeHtml(intern.name)||'—'}</span></div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px">${(t.skills||[]).map(skillPill).join('')}</div>
        <div class="flex-between">
          ${badge(t.status)}
          ${t.output_link?`<a href="${t.output_link}" target="_blank" style="font-size:11px;color:#C9A84C;font-weight:600">View →</a>`:`<span style="font-size:11px;color:var(--faint)">No link yet</span>`}
        </div>
      </div>
    </div>`;
  }).join('') || `<div class="empty-state"><div class="empty-icon">📦</div>No outputs yet.</div>`;
}

// ─── APPROVALS ────────────────────────────────────────────────────────────────
async function renderApprovals(){
  const pending = pendingApprovals();
  document.getElementById('appr-sub').textContent = `${pending.length} entr${pending.length===1?'y':'ies'} awaiting review`;
  if(!pending.length){
    document.getElementById('appr-list').innerHTML = `<div class="empty-state surface"><div class="empty-icon">🎉</div>All caught up — no pending approvals!</div>`;
    return;
  }
  document.getElementById('appr-list').innerHTML = pending.map(ts=>{
    const task = liveTasks.find(t=>t.id===ts.task_id);
    const intern = liveUsers.find(u=>u.id===ts.intern_id);
    return `<div class="appr-card" style="margin-bottom:12px">
      <div class="appr-layout">
        <div style="display:flex;gap:14px;align-items:flex-start">
          ${avatarEl(intern?.avatar||'?',42)}
          <div>
            <div style="font-weight:700;font-size:14px;color:#1a1a1a">${escapeHtml(intern?.name)||'—'}</div>
            <div style="font-size:11px;color:var(--faint)">${intern?.school||''} · ${ts.date}</div>
            <div style="font-size:13px;color:#374151;margin-top:6px;max-width:380px">${escapeHtml(ts.activity_description)}</div>
            ${task?`<div class="task-link-tag">📋 ${escapeHtml(task.title)}</div>`:''}
            <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px">${(ts.skills||[]).map(skillPillGreen).join('')}</div>
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
  }).join('');
}

// ─── INTERNS ─────────────────────────────────────────────────────────────────
async function renderInterns(){
  const interns = liveUsers.filter(u=>u.role==='intern');
  document.getElementById('interns-grid').innerHTML = interns.map(intern=>{
    const iSheets  = liveTimesheets.filter(t=>t.intern_id===intern.id);
    const approved = iSheets.filter(t=>t.status==='approved').reduce((s,t)=>s+t.hours,0);
    const pending  = iSheets.filter(t=>t.status==='pending').length;
    const done     = liveTasks.filter(t=>t.assigned_to===intern.id&&['completed','reviewed'].includes(t.status)).length;
    const skillMap = {};
    iSheets.filter(t=>t.status==='approved').forEach(ts=>(ts.skills||[]).forEach(s=>{skillMap[s]=(skillMap[s]||0)+1;}));
    const topSkills = Object.entries(skillMap).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([s])=>s);
    return `<div class="intern-card">
      <div class="intern-card-head">
        ${avatarEl(intern.avatar,46,'#C9A84C')}
        <div>
          <div class="intern-card-name">${escapeHtml(intern.name)}</div>
          <div class="intern-card-sub">${intern.program} · ${intern.school}</div>
        </div>
      </div>
      <div class="intern-stats">
        <div class="intern-stat"><div class="sv">${approved}h</div><div class="sl">Approved hrs</div></div>
        <div class="intern-stat"><div class="sv">${done}</div><div class="sl">Tasks done</div></div>
        <div class="intern-stat"><div class="sv">${pending}</div><div class="sl">Pending</div></div>
      </div>
      <div class="intern-skills">
        ${topSkills.length?`<div class="section-label">TOP SKILLS</div><div class="flex-wrap">${topSkills.map(skillPill).join('')}</div>`:'<div style="font-size:12px;color:var(--faint)">No approved entries yet.</div>'}
      </div>
    </div>`;
  }).join('');
}

// ─── REPORTS ─────────────────────────────────────────────────────────────────
async function renderReports(){
  const interns = liveUsers.filter(u=>u.role==='intern');
  const totalApprH = liveTimesheets.filter(t=>t.status==='approved').reduce((s,t)=>s+t.hours,0);
  const pending    = pendingApprovals().length;

  document.getElementById('report-overview').innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <span style="font-size:22px">📊</span>
      <h3 style="margin:0;font-size:15px;font-weight:700;color:#252f27">System Overview</h3>
    </div>
    <div class="grid4">
      ${[['Total Interns',interns.length],['Total Tasks',liveTasks.length],['Approved Hours',totalApprH+'h'],['Pending Approvals',pending]].map(([k,v])=>`
        <div style="background:#f9fafb;border-radius:8px;padding:12px 14px">
          <div style="font-size:22px;font-weight:800;color:#252f27">${v}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">${k}</div>
        </div>`).join('')}
    </div>`;

  document.getElementById('reports-tbody').innerHTML = interns.map(intern=>{
    const iSheets  = liveTimesheets.filter(t=>t.intern_id===intern.id&&t.status==='approved');
    const iHours   = iSheets.reduce((s,t)=>s+t.hours,0);
    const iDone    = liveTasks.filter(t=>t.assigned_to===intern.id&&['completed','reviewed'].includes(t.status)).length;
    const skillSet = new Set(); iSheets.forEach(ts=>(ts.skills||[]).forEach(s=>skillSet.add(s)));
    const skillArr = [...skillSet];
    return `<tr>
      <td><div class="flex-gap-8">${avatarEl(intern.avatar,28)}<span class="text-bold">${escapeHtml(intern.name)}</span></div></td>
      <td style="color:#374151">${intern.school}</td>
      <td style="color:#374151">${intern.program}</td>
      <td style="font-weight:800;color:#252f27">${iHours}h</td>
      <td style="color:#374151">${iDone} completed</td>
      <td><div style="display:flex;gap:4px;flex-wrap:wrap">${skillArr.slice(0,2).map(skillPill).join('')}${skillArr.length>2?`<span style="font-size:10px;color:var(--faint)">+${skillArr.length-2}</span>`:''}</div></td>
      <td><div style="display:flex;gap:5px">
        <button style="background:#ecfdf5;color:#16a34a;border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer" data-action="export-excel" data-id="${intern.id}">📊 Excel</button>
        <button style="background:#eff6ff;color:#2563eb;border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer" data-action="export-pdf" data-id="${intern.id}">📄 PDF</button>
      </div></td>
    </tr>`;
  }).join('');
}

function exportExcel(uid){
  const intern = liveUsers.find(u=>u.id===uid);
  const sheets = liveTimesheets.filter(t=>t.intern_id===uid&&t.status==='approved');
  let csv = 'Date,Task,Activity,Hours,Category,Skills,Status\n';
  sheets.forEach(ts=>{
    const task = liveTasks.find(t=>t.id===ts.task_id);
    csv += `"${ts.date}","${escapeHtml(task?.title)||'—'}","${escapeHtml(ts.activity_description)}",${ts.hours},"${ts.industry_category}","${(ts.skills||[]).join('; ')}","${ts.status}"\n`;
  });
  const blob = new Blob([csv],{type:'text/csv'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`${intern.name.replace(' ','_')}_Timesheet.csv`; a.click();
  toast('Excel export downloaded!');
}

function exportPDF(uid){
  const intern = liveUsers.find(u=>u.id===uid);
  const supervisor = liveUsers.find(u => u.role === 'supervisor') || { name: 'Supervisor' };
  const sheets = liveTimesheets.filter(t=>t.intern_id===uid&&t.status==='approved');
  const totalH = sheets.reduce((s,t)=>s+t.hours,0);
  const skillMap={}; sheets.forEach(ts=>(ts.skills||[]).forEach(s=>{skillMap[s]=(skillMap[s]||0)+1;}));
  const topSkills=Object.entries(skillMap).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([s])=>s);
  const rows = sheets.map(ts=>{
    const task=liveTasks.find(t=>t.id===ts.task_id);
    return `<tr><td>${ts.date}</td><td>${escapeHtml(task?.title)||'—'}</td><td>${escapeHtml(ts.activity_description)}</td><td>${ts.hours}h</td><td>${ts.industry_category}</td></tr>`;
  }).join('');
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body{font-family:'DM Sans',sans-serif;padding:40px;color:#1a1a1a;max-width:800px;margin:0 auto}
    h1{color:#252f27;font-size:22px;margin-bottom:4px} .sub{color:#6b7280;font-size:13px}
    .divider{border:none;border-top:2px solid #C9A84C;margin:20px 0}
    .meta-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px}
    .meta-box{background:#f9fafb;border-radius:8px;padding:12px;text-align:center}
    .meta-box .v{font-size:20px;font-weight:800;color:#252f27}.meta-box .l{font-size:11px;color:#6b7280;margin-top:2px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{background:#252f27;color:#F5ECD7;padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase}
    td{padding:9px 12px;border-bottom:1px solid #f3f4f6} tr:nth-child(even) td{background:#fafafa}
    .sig-section{margin-top:40px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px}
    .sig-box{border-top:2px solid #e5e7eb;padding-top:8px;font-size:11px;color:#6b7280}
    .skills-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
    .sp{background:#eef2ff;color:#6366f1;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:600}
  </style></head><body>
    <h1>Internship Timesheet Report</h1>
    <div class="sub">Disenyo Digitals Collective OPC · Baguio City, Philippines</div>
    <hr class="divider"/>
    <div class="meta-grid">
      <div class="meta-box"><div class="v">${escapeHtml(intern.name)}</div><div class="l">Intern Name</div></div>
      <div class="meta-box"><div class="v">${intern.program}</div><div class="l">Program</div></div>
      <div class="meta-box"><div class="v">${intern.school}</div><div class="l">School</div></div>
    </div>
    <div class="meta-grid">
      <div class="meta-box"><div class="v">${totalH}h</div><div class="l">Total Approved Hours</div></div>
      <div class="meta-box"><div class="v">${sheets.length}</div><div class="l">Approved Entries</div></div>
      <div class="meta-box"><div class="v">${new Date().toLocaleDateString('en-PH')}</div><div class="l">Report Date</div></div>
    </div>
    <h3 style="margin:0 0 8px;font-size:14px;color:#252f27">Top Skills Demonstrated</h3>
    <div class="skills-row">${topSkills.map(s=>`<span class="sp">${s}</span>`).join('')}</div>
    <hr class="divider"/>
    <table><thead><tr><th>Date</th><th>Task</th><th>Activity</th><th>Hours</th><th>Category</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="sig-section">
      <div class="sig-box"><strong>Intern Signature</strong><br/>${escapeHtml(intern.name)}<br/><br/><br/>___________________</div>
      <div class="sig-box"><strong>Supervisor Signature</strong><br/>${supervisor.name}<br/><br/><br/>___________________</div>
      <div class="sig-box"><strong>Company Seal</strong><br/>Disenyo Digitals<br/>Collective OPC<br/><br/>___________________</div>
    </div>
  </body></html>`;
  const w=window.open('','_blank'); w.document.write(html); w.document.close(); w.print();
  toast('PDF report opened for printing!');
}

// ─── REALTIME ─────────────────────────────────────────────────────────────────
function setupRealtime() {
  sb.channel('intern-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'intern_tasks' }, async () => {
      await loadLiveTasks();
      await updateBadges();
      if (activePage === 'tasks' || activePage === 'dashboard' || activePage === 'outputs') {
        await renderPage(activePage);
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'intern_timesheets' }, async () => {
      await loadLiveTimesheets();
      await updateBadges();
      if (activePage === 'timesheets' || activePage === 'dashboard' || activePage === 'approvals') {
        await renderPage(activePage);
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'intern_users' }, async () => {
      await loadLiveUsers();
      if (activePage === 'interns' || activePage === 'reports') {
        await renderPage(activePage);
      }
    })
    .subscribe();
}

// ─── AUTH ────────────────────────────────────────────────────────────────────
async function handleSignOut() {
  await sb.auth.signOut();
  window.location.href = 'login.html';
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  try {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  const { data: profile, error } = await sb.from('intern_users')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (!profile || error) {
    document.getElementById('page-dashboard').innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh;text-align:center;padding:40px">
        <div style="font-size:48px;margin-bottom:16px">👋</div>
        <h2 style="margin-bottom:8px">Welcome to Intern Command Center</h2>
        <p style="color:var(--muted);margin-bottom:24px;max-width:400px">
          Your profile hasn't been set up yet. Please contact your supervisor or administrator to create your account.
        </p>
        <button class="btn-primary" data-action="signout" style="padding:10px 24px">Sign Out</button>
      </div>`;
    return;
  }

  currentUser = {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    avatar: profile.avatar || profile.name.slice(0, 2).toUpperCase(),
    program: profile.program,
    school: profile.school
  };

  document.getElementById('topbar-name').textContent = profile.name;
  document.getElementById('topbar-role').textContent = profile.role;
  document.getElementById('topbar-avatar').textContent = currentUser.avatar;
  document.getElementById('topbar-date').textContent = new Date().toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  document.getElementById('sb-avatar').textContent = currentUser.avatar;
  document.getElementById('sb-name').textContent   = currentUser.name;
  document.getElementById('sb-role').textContent   = currentUser.role;

  applyRoleVisibility();
  await loadLiveUsers();
  await loadLiveTasks();
  await loadLiveTimesheets();
  await populateAddTaskModal();
  await updateBadges();
  await renderPage('dashboard');
  setupRealtime();
  } catch (err) {
    handleError('init', err);
    window.location.href = 'login.html';
  }
}

init();
