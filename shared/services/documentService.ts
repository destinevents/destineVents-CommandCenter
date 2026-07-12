import { sb } from './supabase';
import { handleServiceError } from './serviceError.ts';
import type { Document } from '../types';

export async function fetchDocuments(): Promise<Document[]> {
  const { data, error } = await sb.from('documents').select('*').order('created_at', { ascending: false });
  if (error) { handleServiceError('fetchDocuments', error); return []; }
  return (data ?? []) as Document[];
}

export async function uploadDocument(file: File, path: string): Promise<{ path: string } | null> {
  const { data, error } = await sb.storage.from('documents').upload(path, file);
  if (error) { handleServiceError('uploadDocument', error); return null; }
  return data;
}

export function getDocumentPublicUrl(path: string): string {
  return sb.storage.from('documents').getPublicUrl(path).data.publicUrl;
}

export async function saveDocumentMeta(data: Partial<Document>): Promise<Document | null> {
  const { data: result, error } = await sb.from('documents').insert(data).select();
  if (error) { handleServiceError('saveDocumentMeta', error); return null; }
  return (result as Document[] | null)?.[0] ?? null;
}

export async function getDocumentSignedUrl(path: string, expiresIn = 3600): Promise<string | null> {
  const { data, error } = await sb.storage.from('documents').createSignedUrl(path, expiresIn);
  if (error) { handleServiceError('getDocumentSignedUrl', error); return null; }
  return data?.signedUrl ?? null;
}

export async function removeDocument(id: number, path: string | null): Promise<boolean> {
  if (path) {
    const { error: storageError } = await sb.storage.from('documents').remove([path]);
    if (storageError) handleServiceError('removeDocument (storage)', storageError);
  }
  const { error } = await sb.from('documents').delete().eq('id', id);
  if (error) { handleServiceError('removeDocument (db)', error); return false; }
  return true;
}
