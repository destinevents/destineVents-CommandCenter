import { sb } from './supabase';
import { handleServiceError } from './serviceError.ts';

export async function fetchEvents() {
  const { data, error } = await sb.from('events').select('*').order('date', { ascending: true });
  if (error) { handleServiceError('fetchEvents', error); return []; }
  return data;
}

export async function fetchEventById(id) {
  const { data, error } = await sb.from('events').select('*').eq('id', id).single();
  if (error) { handleServiceError('fetchEventById', error); return null; }
  return data;
}

export async function createEvent(data) {
  const { data: result, error } = await sb.from('events').insert(data).select();
  if (error) { handleServiceError('createEvent', error); return null; }
  return result?.[0] || null;
}

export async function updateEventStatus(id, status) {
  const { error } = await sb.from('events').update({ status }).eq('id', id);
  if (error) { handleServiceError('updateEventStatus', error); return false; }
  return true;
}

export async function updateEvent(id, data) {
  const { error } = await sb.from('events').update(data).eq('id', id);
  if (error) { handleServiceError('updateEvent', error); return false; }
  return true;
}

export async function deleteEvent(id) {
  const { error } = await sb.from('events').delete().eq('id', id);
  if (error) { handleServiceError('deleteEvent', error); return false; }
  return true;
}

export async function fetchAllRegistrations() {
  const { data, error } = await sb
    .from('event_registrations')
    .select('*')
    .order('registered_at', { ascending: true });
  if (error) { handleServiceError('fetchAllRegistrations', error); return []; }
  return data;
}

export async function fetchRegistrations(eventId) {
  const { data, error } = await sb
    .from('event_registrations')
    .select('*')
    .eq('event_id', eventId)
    .order('registered_at', { ascending: true });
  if (error) { handleServiceError('fetchRegistrations', error); return []; }
  return data;
}

export async function createRegistration(data) {
  const { data: result, error } = await sb.from('event_registrations').insert(data).select();
  if (error) { handleServiceError('createRegistration', error); return null; }
  return result?.[0] || null;
}

export async function updateRegistrationStatus(id, status) {
  const { error } = await sb.from('event_registrations').update({ status }).eq('id', id);
  if (error) { handleServiceError('updateRegistrationStatus', error); return false; }
  return true;
}
