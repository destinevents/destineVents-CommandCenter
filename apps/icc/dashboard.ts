// @ts-nocheck
import { renderStatCards } from '../../shared/components/statCard.ts';
import { escapeHtml, badge } from '../../shared/utils/helpers.ts';
import { formatDateShort } from '../../shared/utils/dateUtils.ts';
import { currentUser, myTasks, mySheets, pendingApprovals } from './state.ts';
import { isOverdue } from './tasks.ts';

export async function renderDashboard() {
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

  const requiredHours  = currentUser.required_hours;
  const remainingHours = requiredHours ? Math.max(0, requiredHours - approvedHours) : null;

  const statsData = [
    {icon:'⏰', label:'Approved Hours',   value:approvedHours+'h', sub:requiredHours ? `of ${requiredHours}h required` : 'Total', valColor:'#252f27'},
    ...(currentUser.role==='intern' && requiredHours ? [{icon:'⏳', label:'Remaining Hours', value:remainingHours+'h', sub:'To complete', valColor:'#C9A84C'}] : []),
    {icon:'📋', label:'Active Tasks',     value:activeTasks,       sub:overdueTasks ? `${overdueTasks} overdue ⚠` : 'In progress', valColor:overdueTasks ? '#ef4444' : '#C9A84C'},
    {icon:'✅', label:'Tasks Completed',  value:doneTasks,         sub:'Done',       valColor:'#10b981'},
    ...(currentUser.role!=='intern'?[{icon:'🔔', label:'Pending Approvals', value:pending, sub:'Queue', valColor:'#f59e0b'}]:[]),
  ];
  const dashStatsEl = document.getElementById('dash-stats');
  if (dashStatsEl) dashStatsEl.className = statsData.length >= 4 ? 'grid4' : 'grid3';
  renderStatCards('dash-stats', statsData);

  // ── Proactive nudges ──────────────────────────────────────────────────────
  const nudges = [];
  if (currentUser.role === 'intern') {
    const sorted = [...sheets].sort((a, b) => b.date.localeCompare(a.date));
    if (!sorted.length) {
      nudges.push({ type: 'warn', msg: "You haven't logged any hours yet — start with today's work." });
    } else {
      const daysSince = Math.floor((Date.now() - new Date(sorted[0].date)) / 86400000);
      if (daysSince >= 3) nudges.push({ type: 'warn', msg: `No hours logged in ${daysSince} day${daysSince !== 1 ? 's' : ''} — remember to log your daily activity.` });
    }
    if (overdueTasks > 0) nudges.push({ type: 'danger', msg: `You have ${overdueTasks} overdue task${overdueTasks !== 1 ? 's' : ''} — check your task board.` });
    if (requiredHours && approvedHours >= requiredHours) nudges.push({ type: 'success', msg: `You've reached your required ${requiredHours}h! 🎉 Contact your supervisor to wrap up.` });
  } else {
    if (pending > 0) nudges.push({ type: 'warn', msg: `${pending} timesheet entr${pending !== 1 ? 'ies' : 'y'} waiting for your approval.` });
  }
  const nudgeEl = document.getElementById('dash-nudges');
  if (nudgeEl) nudgeEl.innerHTML = nudges.map(n => `<div class="dash-nudge dash-nudge--${n.type}">${n.msg}</div>`).join('');

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
    return `<tr>
      <td style="color:#374151;white-space:nowrap">${ts.date}</td>
      <td class="truncate text-ink">${escapeHtml(ts.activity_description)}</td>
      <td class="hours-display">${ts.hours}h</td>
      <td class="text-muted">${ts.industry_category}</td>
      <td>${badge(ts.status)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" class="no-data-center">No entries yet.</td></tr>';
}
