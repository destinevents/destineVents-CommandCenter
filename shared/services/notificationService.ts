// ICC-only service — converted in place from notificationService.js.
import { sb } from './supabase';
import { logger } from '../utils/loggerUtils.ts';

export interface InternNotification {
  id: string;
  user_id: string;
  message: string;
  link_page: string | null;
  read: boolean;
  created_at: string;
}

export async function fetchNotifications(userId: string, limit = 30): Promise<InternNotification[]> {
  const { data, error } = await sb
    .from('intern_notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    logger.error('notificationService', 'Failed to fetch notifications', error);
    return [];
  }
  return (data as InternNotification[]) ?? [];
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await sb.from('intern_notifications').update({ read: true }).in('id', ids);
  if (error) logger.error('notificationService', 'Failed to mark notifications read', error);
}
