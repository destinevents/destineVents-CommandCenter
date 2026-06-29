async function fetchTasks(role, userId) {
  let query = sb.from('intern_tasks').select('*').order('created_at', { ascending: false });
  if (role === ROLES.INTERN) query = query.eq('assigned_to', userId);
  const { data, error } = await query;
  if (error) { handleServiceError('fetchTasks', error); return []; }
  return data;
}

async function createTask(data) {
  const { data: result, error } = await sb.from('intern_tasks').insert(data).select();
  if (error) { handleServiceError('createTask', error); return null; }
  return result?.[0] || null;
}

async function updateTask(id, data) {
  const { data: result, error } = await sb.from('intern_tasks').update(data).eq('id', id).select();
  if (error) { handleServiceError('updateTask', error); return null; }
  return result?.[0] || null;
}

const TASK_STATUS_TRANSITIONS = {
  assigned: { next: 'acknowledged', actionLabel: 'Acknowledge' },
  acknowledged: { next: 'in_progress', actionLabel: 'Start' },
  in_progress: { next: 'completed', actionLabel: 'Mark Complete' },
  completed: { next: 'reviewed', actionLabel: 'Mark Reviewed' },
  reviewed: { next: null, actionLabel: null },
};

function getNextTaskAction(task, role) {
  if (!task) return null;
  const transition = TASK_STATUS_TRANSITIONS[task.status];
  if (!transition || !transition.next) return null;
  if (task.status === 'completed' && role === ROLES.INTERN) return null;
  if (task.status === 'completed' && role === ROLES.INTERN) return null;
  if (task.status === 'completed') return { action: 'review', label: transition.actionLabel, style: '#f5f3ff;color:#8b5cf6' };
  if (transition.next === 'acknowledged' && role === ROLES.INTERN) return { action: 'acknowledge', label: transition.actionLabel, style: '#fffbeb;color:#f59e0b' };
  if (transition.next === 'in_progress' && role === ROLES.INTERN) return { action: 'start', label: transition.actionLabel, style: '#eff6ff;color:#3b82f6' };
  if (transition.next === 'completed' && role === ROLES.INTERN) return { action: 'complete', label: transition.actionLabel, style: '#ecfdf5;color:#10b981' };
  return null;
}

function requiresOutputLink(outputType) {
  return ['code', 'design', 'video', 'landing_page'].includes(outputType);
}

function calcTaskStats(tasks) {
  return {
    total: tasks.length,
    active: tasks.filter(t => !['completed', 'reviewed'].includes(t.status)).length,
    completed: tasks.filter(t => ['completed', 'reviewed'].includes(t.status)).length,
    byStatus: Object.fromEntries(
      ['assigned', 'acknowledged', 'in_progress', 'completed', 'reviewed'].map(s => [
        s, tasks.filter(t => t.status === s).length
      ])
    ),
  };
}
