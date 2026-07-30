import { sb } from '@shared/core/supabase';
import { handleServiceError } from '@shared/core/serviceError.ts';
import type { Budget } from '@shared/types';

export async function fetchBudgets(): Promise<Budget[]> {
  const { data, error } = await sb
    .from('budgets')
    .select('*')
    .order('period_year', { ascending: false })
    .order('category', { ascending: true });
  if (error) { handleServiceError('fetchBudgets', error); return []; }
  return (data ?? []) as Budget[];
}

export async function createBudget(data: Partial<Budget>): Promise<Budget | null> {
  const { data: result, error } = await sb.from('budgets').insert(data).select();
  if (error) { handleServiceError('createBudget', error); return null; }
  return (result as Budget[] | null)?.[0] ?? null;
}

export async function updateBudget(id: number, data: Partial<Budget>): Promise<boolean> {
  const { error } = await sb.from('budgets').update(data).eq('id', id);
  if (error) { handleServiceError('updateBudget', error); return false; }
  return true;
}

export async function deleteBudget(id: number): Promise<boolean> {
  const { error } = await sb.from('budgets').delete().eq('id', id);
  if (error) { handleServiceError('deleteBudget', error); return false; }
  return true;
}
