async function fetchTasks(role, userId) {
  const base = sb.from('intern_tasks').select('*');
  const query = role === 'intern' ? base.eq('assigned_to', userId) : base;
  const { data, error } = await query.order('created_at', { ascending: false });
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

async function updateTask(id, data) {
  const { data: result, error } = await sb.from('intern_tasks').update(data).eq('id', id).select();
  if (error) {
    logger.error('updateTask', error.message, error);
    return null;
  }
  return result?.[0] ?? null;
}
