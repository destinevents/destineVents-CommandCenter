import { sb } from './supabase';
import { logger } from '../utils/logger.ts';
import { showToast } from '../components/toast.ts';
import type { InternUser, UserRole } from '../types';

export async function fetchUsers(): Promise<InternUser[]> {
  const { data, error } = await sb
    .from('intern_users')
    .select('*')
    .neq('role', 'pending')
    .order('created_at', { ascending: false });
  if (error) {
    logger.error('fetchUsers', error.message, error);
    showToast(`Something went wrong: ${error.message || 'Unknown error'}. Try refreshing.`);
    return [];
  }
  return (data as InternUser[]) || [];
}

export async function fetchPendingUsers(): Promise<InternUser[]> {
  const { data, error } = await sb
    .from('intern_users')
    .select('*')
    .eq('role', 'pending')
    .order('created_at', { ascending: true });
  if (error) {
    logger.error('fetchPendingUsers', error.message, error);
    return [];
  }
  return (data as InternUser[]) || [];
}

export async function fetchAllUsers(): Promise<InternUser[]> {
  const { data, error } = await sb
    .from('intern_users')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    logger.error('fetchAllUsers', error.message, error);
    return [];
  }
  return (data as InternUser[]) || [];
}

export async function updateUserRole(id: string, role: UserRole): Promise<boolean> {
  const { error } = await sb
    .from('intern_users')
    .update({ role })
    .eq('id', id);
  if (error) {
    logger.error('updateUserRole', error.message, error);
    return false;
  }
  return true;
}
