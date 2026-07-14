import { sb } from '@shared/services/core/supabase';
import { handleServiceError } from '@shared/services/core/serviceError.ts';
import type { Partner } from '@shared/types';

export async function fetchPartners(): Promise<Partner[]> {
  const { data, error } = await sb.from('partners').select('*').order('name');
  if (error) { handleServiceError('fetchPartners', error); return []; }
  return (data ?? []) as Partner[];
}

export async function createPartner(data: Partial<Partner>): Promise<Partner | null> {
  const { data: result, error } = await sb.from('partners').insert(data).select();
  if (error) { handleServiceError('createPartner', error); return null; }
  return (result as Partner[] | null)?.[0] ?? null;
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
