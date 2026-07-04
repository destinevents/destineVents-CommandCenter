async function renderDashboard() {
  const first = (currentUser.name || 'there').split(' ')[0];
  document.getElementById('dash-greeting').textContent = `Good day, ${first} 👋`;
  document.getElementById('dash-date').textContent = new Date().toLocaleDateString('en-PH',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

  const sheets = mySheets();
  const tasks  = myTasks();
  const approvedHours = sheets.filter(t=>t.status==='approved').reduce((s,t)=>s+t.hours,0);
  const activeTasks   = tasks.filter(t=>!['completed','reviewed'].includes(t.status)).length;
  const doneTasks     = tasks.filter(t=>['completed','reviewed'].includes(t.status)).length;
  const overdueTasks  = tasks.filter(isOverdue).length;
  const pending       = pendingApprovals().length;

  const statsData = [
    {icon:'⏰', label:'Approved Hours',   value:approvedHours+'h', sub:'Total',      valColor:'#252f27'},
    {icon:'📋', label:'Active Tasks',     value:activeTasks,       sub:overdueTasks ? `${overdueTasks} overdue ⚠` : 'In progress', valColor:overdueTasks ? '#ef4444' : '#C9A84C'},
    {icon:'✅', label:'Tasks Completed',  value:doneTasks,         sub:'Done',       valColor:'#10b981'},
    ...(currentUser.role!=='intern'?[{icon:'🔔', label:'Pending Approvals', value:pending, sub:'Queue', valColor:'#f59e0b'}]:[]),
  ];
  renderStatCards('dash-stats', statsData);

  const recentTasks = tasks.slice(0,4);
  document.getElementById('dash-tasks-list').innerHTML = recentTasks.map(t=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f3f4f6;">
      <div>
        <div class="text-base text-bold text-ink">${escapeHtml(t.title)}</div>
        <div class="text-xs text-faint mt-2">${t.industry_category} · ${t.due_date ? `Due ${formatDateShort(t.due_date)}` : 'No due date'}</div>
      </div>
      ${badge(t.status)}
    </div>`).join('') || '<div class="no-data">No tasks yet.</div>';

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
