import { sb } from './supabase';
import { handleServiceError } from './serviceError.ts';

export async function fetchDocuments() {
  const { data, error } = await sb.from('documents').select('*').order('created_at', { ascending: false });
  if (error) { handleServiceError('fetchDocuments', error); return []; }
  return data;
}

export async function uploadDocument(file, path) {
  const { data, error } = await sb.storage.from('documents').upload(path, file);
  if (error) { handleServiceError('uploadDocument', error); return null; }
  return data;
}

export function getDocumentPublicUrl(path) {
  return sb.storage.from('documents').getPublicUrl(path).data.publicUrl;
}

export async function saveDocumentMeta(data) {
  const { data: result, error } = await sb.from('documents').insert(data).select();
  if (error) { handleServiceError('saveDocumentMeta', error); return null; }
  return result?.[0] || null;
}
