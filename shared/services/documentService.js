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

export async function getDocumentSignedUrl(path, expiresIn = 3600) {
  const { data, error } = await sb.storage.from('documents').createSignedUrl(path, expiresIn);
  if (error) { handleServiceError('getDocumentSignedUrl', error); return null; }
  return data?.signedUrl || null;
}

export async function removeDocument(id, path) {
  if (path) {
    const { error: storageError } = await sb.storage.from('documents').remove([path]);
    if (storageError) handleServiceError('removeDocument (storage)', storageError);
  }
  const { error } = await sb.from('documents').delete().eq('id', id);
  if (error) { handleServiceError('removeDocument (db)', error); return false; }
  return true;
}
