import { sb } from './supabase';

export async function fetchTimelogs() {
  const { data, error } = await sb
    .from('time_logs')
    .select('*')
    .order('date', { ascending: false })
    .limit(500);
  if (error) return [];
  return data ?? [];
}

export async function createTimelog(payload) {
  const { data, error } = await sb.from('time_logs').insert(payload).select();
  if (error) return null;
  return data?.[0] ?? null;
}

export async function updateTimelog(id, payload) {
  const { data, error } = await sb.from('time_logs').update(payload).eq('id', id).select();
  if (error) return null;
  return data?.[0] ?? null;
}

export async function deleteTimelog(id) {
  const { error } = await sb.from('time_logs').delete().eq('id', id);
  return !error;
}
