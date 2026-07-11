import { sb } from './supabase';
import { handleServiceError } from './serviceError.ts';

export async function fetchClients() {
  const { data, error } = await sb.from('clients').select('*').order('name');
  if (error) { handleServiceError('fetchClients', error); return []; }
  return data;
}

export async function createClient(data) {
  const { data: result, error } = await sb.from('clients').insert(data).select();
  if (error) { handleServiceError('createClient', error); return null; }
  return result?.[0] || null;
}

export async function updateClient(id, data) {
  const { error } = await sb.from('clients').update(data).eq('id', id);
  if (error) { handleServiceError('updateClient', error); return false; }
  return true;
}

export async function deleteClient(id) {
  const { error } = await sb.from('clients').delete().eq('id', id);
  if (error) { handleServiceError('deleteClient', error); return false; }
  return true;
}

export function getClientTotalValue(clients) {
  return clients.reduce((s, c) => s + (c.total_value || 0), 0);
}

export function findClientByName(name, clients) {
  if (!name || !clients) return null;
  return clients.find(c => c.name?.toLowerCase() === name.toLowerCase()) || null;
}

