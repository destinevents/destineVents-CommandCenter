import { sb } from './supabase';
import { logger } from '../utils/logger.ts';
import type { Project, ProjectCreateResult } from '../types';

export async function fetchProjects(): Promise<Project[]> {
  const { data, error } = await sb
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { logger.error('fetchProjects', error.message, error); return []; }
  return (data ?? []) as Project[];
}

export async function createProject(proj: Partial<Project>): Promise<ProjectCreateResult> {
  const { data, error } = await sb.from('projects').insert(proj).select();
  if (error) { logger.error('createProject', error.message, error); return { ok: false, message: error.message }; }
  return { ok: true, data: (data as Project[])[0] };
}

export async function updateProjectStatus(id: number, status: string): Promise<Project | null> {
  const { data, error } = await sb
    .from('projects')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) { logger.error('updateProjectStatus', error.message, error); return null; }
  return data as Project;
}

export async function updateProject(id: number, data: Partial<Project>): Promise<boolean> {
  const { error } = await sb
    .from('projects')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { logger.error('updateProject', error.message, error); return false; }
  return true;
}

export async function deleteProject(id: number): Promise<boolean> {
  const { error } = await sb.from('projects').delete().eq('id', id);
  if (error) { logger.error('deleteProject', error.message, error); return false; }
  return true;
}
