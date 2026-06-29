async function fetchTimesheets(role, userId) {
  let query = sb.from('intern_timesheets').select('*').order('date', { ascending: false });
  if (role === ROLES.INTERN) query = query.eq('intern_id', userId);
  const { data, error } = await query;
  if (error) { handleServiceError('fetchTimesheets', error); return []; }
  return data;
}

async function createTimesheet(data) {
  const { data: result, error } = await sb.from('intern_timesheets').insert(data).select();
  if (error) { handleServiceError('createTimesheet', error); return null; }
  return result?.[0] || null;
}

async function updateTimesheet(id, data) {
  const { data: result, error } = await sb.from('intern_timesheets').update(data).eq('id', id).select();
  if (error) { handleServiceError('updateTimesheet', error); return null; }
  return result?.[0] || null;
}

function calcTimesheetStats(sheets) {
  const approved = sheets.filter(t => t.status === 'approved');
  const pending = sheets.filter(t => t.status === 'pending');
  return {
    total: sheets.length,
    approvedHours: approved.reduce((s, t) => s + t.hours, 0),
    pendingHours: pending.reduce((s, t) => s + t.hours, 0),
    totalHours: sheets.reduce((s, t) => s + t.hours, 0),
    approvedCount: approved.length,
    pendingCount: pending.length,
  };
}

function getExistingHoursForDate(sheets, date, userId) {
  return sheets
    .filter(ts => ts.date === date && ts.intern_id === userId)
    .reduce((s, t) => s + t.hours, 0);
}

function buildSkillFrequency(sheets) {
  const skillMap = {};
  sheets.filter(t => t.status === 'approved').forEach(ts =>
    (ts.skills || []).forEach(s => { skillMap[s] = (skillMap[s] || 0) + 1; })
  );
  return Object.entries(skillMap)
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count);
}
