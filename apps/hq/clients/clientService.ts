import { sb } from '@shared/core/supabase';
import { handleServiceError } from '@shared/core/serviceError.ts';
import type { Client } from '@shared/types';

export async function fetchClients(): Promise<Client[]> {
  const { data, error } = await sb.from('clients').select('*').order('name');
  if (error) { handleServiceError('fetchClients', error); return []; }
  return (data ?? []) as Client[];
}

export async function createClient(data: Partial<Client>): Promise<Client | null> {
  const { data: result, error } = await sb.from('clients').insert(data).select();
  if (error) { handleServiceError('createClient', error); return null; }
  return (result as Client[] | null)?.[0] ?? null;
}

export async function updateClient(id: number, data: Partial<Client>): Promise<boolean> {
  const { error } = await sb.from('clients').update(data).eq('id', id);
  if (error) { handleServiceError('updateClient', error); return false; }
  return true;
}

export async function deleteClient(id: number): Promise<boolean> {
  const { error } = await sb.from('clients').delete().eq('id', id);
  if (error) { handleServiceError('deleteClient', error); return false; }
  return true;
}

export function getClientTotalValue(clients: Client[]): number {
  return clients.reduce((s, c) => s + (c.total_value || 0), 0);
}

export function findClientByName(name: string | null, clients: Client[]): Client | null {
  if (!name || !clients) return null;
  return clients.find(c => c.name?.toLowerCase() === name.toLowerCase()) ?? null;
}
