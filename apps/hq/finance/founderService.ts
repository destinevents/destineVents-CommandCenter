import { sb } from '@shared/core/supabase';
import { handleServiceError } from '@shared/core/serviceError.ts';
import type { FounderCapitalEntry } from '@shared/types';

export async function fetchFounderCapital(): Promise<FounderCapitalEntry[]> {
  const { data, error } = await sb
    .from('founder_capital')
    .select('*')
    .order('txn_date', { ascending: false })
    .order('id', { ascending: false });
  if (error) { handleServiceError('fetchFounderCapital', error); return []; }
  return (data ?? []) as FounderCapitalEntry[];
}

export async function createFounderEntry(data: Partial<FounderCapitalEntry>): Promise<FounderCapitalEntry | null> {
  const { data: result, error } = await sb.from('founder_capital').insert(data).select();
  if (error) { handleServiceError('createFounderEntry', error); return null; }
  return (result as FounderCapitalEntry[] | null)?.[0] ?? null;
}

export async function updateFounderEntry(id: number, data: Partial<FounderCapitalEntry>): Promise<boolean> {
  const { error } = await sb.from('founder_capital').update(data).eq('id', id);
  if (error) { handleServiceError('updateFounderEntry', error); return false; }
  return true;
}

export async function deleteFounderEntry(id: number): Promise<boolean> {
  const { error } = await sb.from('founder_capital').delete().eq('id', id);
  if (error) { handleServiceError('deleteFounderEntry', error); return false; }
  return true;
}
