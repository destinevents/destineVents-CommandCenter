// ESM version of shared/services/userService.js (frozen classic copy kept for HQ).
import { sb } from './supabase';
import { logger } from '../utils/logger.ts';
import { showToast } from '../components/toast.ts';
import type { InternUser } from '../types';

export async function fetchUsers(): Promise<InternUser[]> {
  const { data, error } = await sb.from('intern_users').select('*');
  if (error) {
    logger.error('fetchUsers', error.message, error);
    showToast(`Something went wrong: ${error.message || 'Unknown error'}. Try refreshing.`);
    return [];
  }
  return (data as InternUser[]) || [];
}
