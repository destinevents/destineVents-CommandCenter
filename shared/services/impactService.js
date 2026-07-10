import { sb } from './supabase';
import { logger } from '../utils/logger.ts';
import { showToast } from '../components/toast.ts';

export async function fetchImpactEntries() {
  const { data, error } = await sb
    .from('impact_entries')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { logger.error('fetchImpactEntries', error.message, error); return []; }
  return data || [];
}

export async function createImpactEntry(entry) {
  const { data, error } = await sb.from('impact_entries').insert(entry).select().single();
  if (error) { logger.error('createImpactEntry', error.message, error); showToast('Could not save impact entry.', 'error', 3000); return null; }
  return data;
}
