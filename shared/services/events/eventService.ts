import { sb } from '@shared/services/core/supabase';
import { handleServiceError } from '@shared/services/core/serviceError.ts';
import type { Event, EventRegistration } from '@shared/types';

export async function fetchEvents(): Promise<Event[]> {
  const { data, error } = await sb.from('events').select('*').order('date', { ascending: true });
  if (error) { handleServiceError('fetchEvents', error); return []; }
  return (data ?? []) as Event[];
}

export async function fetchEventById(id: number): Promise<Event | null> {
  const { data, error } = await sb.from('events').select('*').eq('id', id).single();
  if (error) { handleServiceError('fetchEventById', error); return null; }
  return data as Event;
}

export async function createEvent(data: Partial<Event>): Promise<Event | null> {
  const { data: result, error } = await sb.from('events').insert(data).select();
  if (error) { handleServiceError('createEvent', error); return null; }
  return (result as Event[] | null)?.[0] ?? null;
}

export async function updateEventStatus(id: number, status: string): Promise<boolean> {
  const { error } = await sb.from('events').update({ status }).eq('id', id);
  if (error) { handleServiceError('updateEventStatus', error); return false; }
  return true;
}

export async function updateEvent(id: number, data: Partial<Event>): Promise<boolean> {
  const { error } = await sb.from('events').update(data).eq('id', id);
  if (error) { handleServiceError('updateEvent', error); return false; }
  return true;
}

export async function deleteEvent(id: number): Promise<boolean> {
  const { error } = await sb.from('events').delete().eq('id', id);
  if (error) { handleServiceError('deleteEvent', error); return false; }
  return true;
}

export async function fetchAllRegistrations(): Promise<EventRegistration[]> {
  const { data, error } = await sb
    .from('event_registrations')
    .select('*')
    .order('registered_at', { ascending: true });
  if (error) { handleServiceError('fetchAllRegistrations', error); return []; }
  return (data ?? []) as EventRegistration[];
}

export async function fetchRegistrations(eventId: number): Promise<EventRegistration[]> {
  const { data, error } = await sb
    .from('event_registrations')
    .select('*')
    .eq('event_id', eventId)
    .order('registered_at', { ascending: true });
  if (error) { handleServiceError('fetchRegistrations', error); return []; }
  return (data ?? []) as EventRegistration[];
}

export async function createRegistration(data: Partial<EventRegistration>): Promise<EventRegistration | null> {
  const { data: result, error } = await sb.from('event_registrations').insert(data).select();
  if (error) { handleServiceError('createRegistration', error); return null; }
  return (result as EventRegistration[] | null)?.[0] ?? null;
}

export async function updateRegistrationStatus(id: number, status: string): Promise<boolean> {
  const { error } = await sb.from('event_registrations').update({ status }).eq('id', id);
  if (error) { handleServiceError('updateRegistrationStatus', error); return false; }
  return true;
}
