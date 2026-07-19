import { sb } from '@shared/core/supabase';
import { handleServiceError } from '@shared/core/serviceError.ts';
import type { Meeting } from '@shared/types';

export async function fetchMeetings(): Promise<Meeting[]> {
  const { data, error } = await sb
    .from('meetings')
    .select('*')
    .order('start_datetime', { ascending: false, nullsFirst: false });
  if (error) { handleServiceError('fetchMeetings', error); return []; }
  return (data ?? []) as Meeting[];
}

export async function fetchMeetingsByClient(clientId: number): Promise<Meeting[]> {
  const { data, error } = await sb
    .from('meetings')
    .select('*')
    .eq('client_id', clientId)
    .order('start_datetime', { ascending: false, nullsFirst: false });
  if (error) { handleServiceError('fetchMeetingsByClient', error); return []; }
  return (data ?? []) as Meeting[];
}

export async function createMeeting(data: Partial<Meeting>): Promise<Meeting | null> {
  const { data: result, error } = await sb.from('meetings').insert(data).select();
  if (error) { handleServiceError('createMeeting', error); return null; }
  return (result as Meeting[] | null)?.[0] ?? null;
}

export async function updateMeeting(id: number, data: Partial<Meeting>): Promise<boolean> {
  const { error } = await sb
    .from('meetings')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { handleServiceError('updateMeeting', error); return false; }
  return true;
}

export async function deleteMeeting(id: number): Promise<boolean> {
  const { error } = await sb.from('meetings').delete().eq('id', id);
  if (error) { handleServiceError('deleteMeeting', error); return false; }
  return true;
}
