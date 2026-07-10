function buildHQDashboardStats(clients, proposals, partners) {
  const activeProjects = proposals.filter(p => p.status === 'Active' || p.status === 'NDA Signed').length;
  const pipelineValue = proposals.reduce((s, p) => s + (p.value || 0), 0);
  const ndaSigned = clients.filter(c => c.status === 'NDA Signed').length;
  return {
    activeProjects,
    pipelineValue: formatCurrency(pipelineValue),
    ndaSigned,
    totalClients: clients.length,
  };
}

function buildInternDashboardStats(tasks, timesheets, currentUser) {
  const approvedHours = timesheets
    .filter(t => t.status === 'approved')
    .reduce((s, t) => s + t.hours, 0);
  const activeTasks = tasks.filter(t => !['completed', 'reviewed'].includes(t.status)).length;
  const doneTasks = tasks.filter(t => ['completed', 'reviewed'].includes(t.status)).length;
  const pendingApprovals = timesheets.filter(t => t.status === 'pending').length;

  return {
    approvedHours,
    activeTasks,
    doneTasks,
    pendingApprovals,
    statCards: [
      { icon: '\u23F0', label: 'Approved Hours', value: approvedHours + 'h', sub: 'Total', valColor: '#252f27' },
      { icon: '\uD83D\uDCCB', label: 'Active Tasks', value: activeTasks, sub: 'In progress', valColor: '#C9A84C' },
      { icon: '\u2705', label: 'Tasks Completed', value: doneTasks, sub: 'Done', valColor: '#10b981' },
      ...(currentUser.role !== ROLES.INTERN
        ? [{ icon: '\uD83D\uDD14', label: 'Pending Approvals', value: pendingApprovals, sub: 'Queue', valColor: '#f59e0b' }]
        : []),
    ],
  };
}

function buildReportStats(timesheets, tasks, users) {
  const interns = users.filter(u => u.role === ROLES.INTERN);
  const totalHours = timesheets.reduce((s, t) => s + t.hours, 0);
  const approvedHours = timesheets.filter(t => t.status === 'approved').reduce((s, t) => s + t.hours, 0);

  const perIntern = interns.map(intern => {
    const mySheets = timesheets.filter(t => t.intern_id === intern.id);
    const myTasks = tasks.filter(t => t.assigned_to === intern.id);
    const skillFreq = buildSkillFrequency(mySheets);
    return {
      ...intern,
      approvedHours: mySheets.filter(t => t.status === 'approved').reduce((s, t) => s + t.hours, 0),
      totalHours: mySheets.reduce((s, t) => s + t.hours, 0),
      tasksDone: myTasks.filter(t => ['completed', 'reviewed'].includes(t.status)).length,
      tasksTotal: myTasks.length,
      topSkills: skillFreq.slice(0, 3).map(s => s.skill),
    };
  });

  return { totalHours, approvedHours, totalInterns: interns.length, perIntern };
}
