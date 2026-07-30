import { sb } from '@shared/core/supabase';
import { handleServiceError } from '@shared/core/serviceError.ts';
import { logger } from '@shared/utils/logger.ts';
import type { Partner } from '@shared/types';

// The optional `project_id` column only exists on databases where migration
// 007 (cross-module links) was applied. On older instances the insert fails
// with an "undefined column" / schema-cache error. Detect that specific case
// so we can gracefully retry without the column instead of hard-failing.
export function isMissingProjectIdError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  const msg = (error.message ?? '').toLowerCase();
  if (!msg.includes('project_id')) return false;
  return code === 'PGRST204' || code === '42703'
    || msg.includes('schema cache') || msg.includes('does not exist');
}

export async function fetchPartners(): Promise<Partner[]> {
  const { data, error } = await sb.from('partners').select('*').order('name');
  if (error) { handleServiceError('fetchPartners', error); return []; }
  return (data ?? []) as Partner[];
}

export async function createPartner(data: Partial<Partner>): Promise<Partner | null> {
  const { data: result, error } = await sb.from('partners').insert(data).select();
  if (!error) return (result as Partner[] | null)?.[0] ?? null;

  // Fallback: retry without `project_id` so a partner can still be added on
  // databases that predate the project-association column.
  if (isMissingProjectIdError(error)) {
    logger.warn('createPartner', 'project_id column missing — retrying without project association');
    const { project_id: _omit, ...rest } = data;
    const { data: retryResult, error: retryError } = await sb.from('partners').insert(rest).select();
    if (retryError) { handleServiceError('createPartner', retryError); return null; }
    return (retryResult as Partner[] | null)?.[0] ?? null;
  }

  handleServiceError('createPartner', error);
  return null;
}

export async function updatePartner(id: number, data: Partial<Partner>): Promise<boolean> {
  const { error } = await sb.from('partners').update(data).eq('id', id);
  if (error) { handleServiceError('updatePartner', error); return false; }
  return true;
}

export async function deletePartner(id: number): Promise<boolean> {
  const { error } = await sb.from('partners').delete().eq('id', id);
  if (error) { handleServiceError('deletePartner', error); return false; }
  return true;
}

export function filterPartnersByType(partners: Partner[], type: string): Partner[] {
  if (!type || type === 'all') return partners;
  return partners.filter(p => p.type === type);
}
