async function fetchNotifications(userId, limit = 30) {
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
  return data ?? [];
}

async function markNotificationsRead(ids) {
  if (!ids.length) return;
  const { error } = await sb.from('intern_notifications').update({ read: true }).in('id', ids);
  if (error) logger.error('notificationService', 'Failed to mark notifications read', error);
}
