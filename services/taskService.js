// Safety cap: newest rows win. High enough to stay a pure guard at this
// team's scale — revisit with true server-side paging if it's ever hit
// (stats/reports would silently undercount beyond it). Sync: taskService.ts
const FETCH_CAP = 2000;

async function fetchTasks(role, userId) {
  const base = sb.from('intern_tasks').select('*');
  const query = role === 'intern' ? base.eq('assigned_to', userId) : base;
  const { data, error } = await query.order('created_at', { ascending: false }).limit(FETCH_CAP);
  if (error) {
    logger.error('fetchTasks', error.message, error);
    return [];
  }
  return data ?? [];
}

async function createTask(data) {
  const { data: result, error } = await sb.from('intern_tasks').insert(data).select();
  if (error) {
    logger.error('createTask', error.message, error);
    return null;
  }
  return result?.[0] ?? null;
}

async function deleteTask(id) {
  const { error } = await sb.from('intern_tasks').delete().eq('id', id);
  if (error) {
    logger.error('deleteTask', error.message, error);
    return false;
  }
  return true;
}

async function updateTask(id, data) {
  const { data: result, error } = await sb.from('intern_tasks').update(data).eq('id', id).select();
  if (error) {
    logger.error('updateTask', error.message, error);
    return null;
  }
  return result?.[0] ?? null;
}
