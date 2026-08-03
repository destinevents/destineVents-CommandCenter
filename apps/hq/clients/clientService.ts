import { sb } from '@shared/core/supabase';
import { handleServiceError } from '@shared/core/serviceError.ts';
import type { Client, Project } from '@shared/types';

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

/**
 * Normalize a name for matching: ignore capitalization, leading/trailing
 * spaces, and any doubled-up spaces in the middle. So "  Chimichanga  by
 * Jaime's " and "chimichanga by jaime's" are treated as the same client.
 */
export function normalizeName(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * A client's live total value = sum of the `value` of every project linked to
 * that client (linked by name — see normalizeName for how flexible the match
 * is). Computed on read rather than stored, so it always reflects the current
 * projects.
 */
export function computeClientValue(
  clientName: string | null | undefined,
  projects: Project[],
): number {
  const name = normalizeName(clientName);
  if (!name) return 0;
  return projects.reduce(
    (s, p) => (normalizeName(p.client) === name ? s + (p.value || 0) : s),
    0,
  );
}

export function findClientByName(name: string | null, clients: Client[]): Client | null {
  if (!name || !clients) return null;
  return clients.find(c => c.name?.toLowerCase() === name.toLowerCase()) ?? null;
}
