import { sb } from '@shared/core/supabase';
import { handleServiceError } from '@shared/core/serviceError.ts';
import type { Contract } from '@shared/types';

export async function fetchContracts(): Promise<Contract[]> {
  const { data, error } = await sb
    .from('contracts')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { handleServiceError('fetchContracts', error); return []; }
  return (data ?? []) as Contract[];
}

export async function createContract(data: Partial<Contract>): Promise<Contract | null> {
  const { data: result, error } = await sb.from('contracts').insert(data).select();
  if (error) { handleServiceError('createContract', error); return null; }
  return (result as Contract[] | null)?.[0] ?? null;
}

export async function updateContract(id: number, data: Partial<Contract>): Promise<boolean> {
  const { error } = await sb.from('contracts').update(data).eq('id', id);
  if (error) { handleServiceError('updateContract', error); return false; }
  return true;
}

export async function deleteContract(id: number): Promise<boolean> {
  const { error } = await sb.from('contracts').delete().eq('id', id);
  if (error) { handleServiceError('deleteContract', error); return false; }
  return true;
}
