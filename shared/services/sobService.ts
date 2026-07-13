import { sb } from './supabase';
import { handleServiceError } from './serviceError.ts';
import type { SOB, SOBLineItem } from '../types';

export async function fetchSOBs(): Promise<SOB[]> {
  const { data, error } = await sb
    .from('statements_of_billing')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { handleServiceError('fetchSOBs', error); return []; }
  return (data ?? []) as SOB[];
}

export async function fetchSOBLineItems(sobId: number): Promise<SOBLineItem[]> {
  const { data, error } = await sb
    .from('sob_line_items')
    .select('*')
    .eq('sob_id', sobId)
    .order('id');
  if (error) { handleServiceError('fetchSOBLineItems', error); return []; }
  return (data ?? []) as SOBLineItem[];
}

export async function upsertSOBLineItems(sobId: number, items: SOBLineItem[]): Promise<boolean> {
  const { error: delError } = await sb.from('sob_line_items').delete().eq('sob_id', sobId);
  if (delError) { handleServiceError('upsertSOBLineItems:delete', delError); return false; }
  if (!items.length) return true;
  const rows = items.map(({ description, quantity, unit_price, vat_rate }) => ({
    sob_id: sobId, description, quantity, unit_price, vat_rate,
  }));
  const { error: insError } = await sb.from('sob_line_items').insert(rows);
  if (insError) { handleServiceError('upsertSOBLineItems:insert', insError); return false; }
  return true;
}

export async function createSOB(data: Partial<SOB>): Promise<SOB | null> {
  const { data: result, error } = await sb.from('statements_of_billing').insert(data).select();
  if (error) { handleServiceError('createSOB', error); return null; }
  return (result as SOB[] | null)?.[0] ?? null;
}

export async function updateSOB(id: number, data: Partial<SOB>): Promise<boolean> {
  const { error } = await sb.from('statements_of_billing').update(data).eq('id', id);
  if (error) { handleServiceError('updateSOB', error); return false; }
  return true;
}

export async function deleteSOB(id: number): Promise<boolean> {
  const { error } = await sb.from('statements_of_billing').delete().eq('id', id);
  if (error) { handleServiceError('deleteSOB', error); return false; }
  return true;
}
