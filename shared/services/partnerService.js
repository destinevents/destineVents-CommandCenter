import { sb } from './supabase';
import { handleServiceError } from './serviceError.ts';

export async function fetchPartners() {
  const { data, error } = await sb.from('partners').select('*').order('name');
  if (error) { handleServiceError('fetchPartners', error); return []; }
  return data;
}

export async function createPartner(data) {
  const { data: result, error } = await sb.from('partners').insert(data).select();
  if (error) { handleServiceError('createPartner', error); return null; }
  return result?.[0] || null;
}

export function filterPartnersByType(partners, type) {
  if (!type || type === 'all') return partners;
  return partners.filter(p => p.type === type);
}
