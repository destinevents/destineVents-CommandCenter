async function fetchUsers() {
  return sb.from('intern_users').select('*');
}

async function fetchTasks(role, userId) {
  let query = sb.from('intern_tasks').select('*').order('created_at', { ascending: false });
  if (role === 'intern') query = query.eq('assigned_to', userId);
  return query;
}

async function createTask(data) {
  return sb.from('intern_tasks').insert(data);
}

async function updateTask(id, data) {
  return sb.from('intern_tasks').update(data).eq('id', id);
}

async function fetchTimesheets(role, userId) {
  let query = sb.from('intern_timesheets').select('*').order('date', { ascending: false });
  if (role === 'intern') query = query.eq('intern_id', userId);
  return query;
}

async function createTimesheet(data) {
  return sb.from('intern_timesheets').insert(data);
}

async function updateTimesheet(id, data) {
  return sb.from('intern_timesheets').update(data).eq('id', id);
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
