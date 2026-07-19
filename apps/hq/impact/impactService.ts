import { sb } from '@shared/core/supabase';
import { logger } from '@shared/utils/logger.ts';
import { showToast } from '@shared/components/toast.ts';
import type { ImpactEntry } from '@shared/types';

export async function fetchImpactEntries(): Promise<ImpactEntry[]> {
  const { data, error } = await sb
    .from('impact_entries')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { logger.error('fetchImpactEntries', error.message, error); return []; }
  return (data ?? []) as ImpactEntry[];
}

export async function createImpactEntry(entry: Partial<ImpactEntry>): Promise<ImpactEntry | null> {
  const { data, error } = await sb.from('impact_entries').insert(entry).select().single();
  if (error) { logger.error('createImpactEntry', error.message, error); showToast('Could not save impact entry.', 'error', 3000); return null; }
  return data as ImpactEntry;
}

export async function updateImpactEntry(id: number, data: Partial<ImpactEntry>): Promise<boolean> {
  const { error } = await sb.from('impact_entries').update(data).eq('id', id);
  if (error) { logger.error('updateImpactEntry', error.message, error); return false; }
  return true;
}

export async function deleteImpactEntry(id: number): Promise<boolean> {
  const { error } = await sb.from('impact_entries').delete().eq('id', id);
  if (error) { logger.error('deleteImpactEntry', error.message, error); return false; }
  return true;
}
