async function fetchProjects() {
  const { data, error } = await sb
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { logger.error('fetchProjects', error.message, error); return []; }
  return data || [];
}

async function createProject(proj) {
  const { data, error } = await sb.from('projects').insert(proj).select().single();
  if (error) { logger.error('createProject', error.message, error); showToast('Could not save project.', 'error', 3000); return null; }
  return data;
}

async function updateProjectStatus(id, status) {
  const { data, error } = await sb
    .from('projects')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) { logger.error('updateProjectStatus', error.message, error); return null; }
  return data;
}
