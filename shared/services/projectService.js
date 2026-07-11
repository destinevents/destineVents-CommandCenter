import { sb } from './supabase';
import { logger } from '../utils/logger.ts';
import { showToast } from '../components/toast.ts';

export async function fetchProjects() {
  const { data, error } = await sb
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { logger.error('fetchProjects', error.message, error); return []; }
  return data || [];
}

export async function createProject(proj) {
  const { data, error } = await sb.from('projects').insert(proj).select();
  if (error) { logger.error('createProject', error.message, error); return { ok: false, message: error.message }; }
  return { ok: true, data: data?.[0] };
}

export async function updateProjectStatus(id, status) {
  const { data, error } = await sb
    .from('projects')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) { logger.error('updateProjectStatus', error.message, error); return null; }
  return data;
}

export async function updateProject(id, data) {
  const { error } = await sb
    .from('projects')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { logger.error('updateProject', error.message, error); return false; }
  return true;
}

export async function deleteProject(id) {
  const { error } = await sb.from('projects').delete().eq('id', id);
  if (error) { logger.error('deleteProject', error.message, error); return false; }
  return true;
}
