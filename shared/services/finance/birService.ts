import { sb } from '@shared/services/core/supabase';
import { logger } from '@shared/utils/logger.ts';
import { showToast } from '@shared/components/toast.ts';
import type { BirFiling } from '@shared/types';

export async function fetchBirFilings(): Promise<BirFiling[]> {
  const { data, error } = await sb
    .from('bir_filings')
    .select('*')
    .order('filed_at', { ascending: false });
  if (error) { logger.error('fetchBirFilings', error.message, error); return []; }
  return (data ?? []) as BirFiling[];
}

export async function createBirFiling(filing: Partial<BirFiling>): Promise<BirFiling | null> {
  const { data, error } = await sb.from('bir_filings').insert(filing).select().single();
  if (error) { logger.error('createBirFiling', error.message, error); showToast('Could not save filing record.', 'error', 3000); return null; }
  return data as BirFiling;
}
