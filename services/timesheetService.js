async function fetchTimesheets(role, userId) {
  const base = sb.from('intern_timesheets').select('*');
  const query = role === 'intern' ? base.eq('intern_id', userId) : base;
  // FETCH_CAP comes from taskService.js (loaded first); same rationale
  const { data, error } = await query.order('date', { ascending: false }).limit(FETCH_CAP);
  if (error) {
    logger.error('fetchTimesheets', error.message, error);
    return [];
  }
  return data ?? [];
}

async function createTimesheet(data) {
  const { data: result, error } = await sb.from('intern_timesheets').insert(data).select();
  if (error) {
    logger.error('createTimesheet', error.message, error);
    return null;
  }
  return result?.[0] ?? null;
}

async function deleteTimesheet(id) {
  const { error } = await sb.from('intern_timesheets').delete().eq('id', id);
  if (error) {
    logger.error('deleteTimesheet', error.message, error);
    return false;
  }
  return true;
}

async function updateTimesheet(id, data) {
  const { data: result, error } = await sb
    .from('intern_timesheets')
    .update(data)
    .eq('id', id)
    .select();
  if (error) {
    logger.error('updateTimesheet', error.message, error);
    return null;
  }
  return result?.[0] ?? null;
}
