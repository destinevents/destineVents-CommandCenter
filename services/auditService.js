async function fetchAuditLogs(limit = 200) {
  const { data, error } = await sb
    .from('intern_audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    logger.error('auditService', 'Failed to fetch audit logs', error);
    return [];
  }
  return data ?? [];
}

async function logAudit(action, targetType, targetId, metadata, performedBy) {
  if (!performedBy) {
    logger.warn('auditService', 'logAudit called without performedBy — skipping');
    return;
  }
  const { error } = await sb.from('intern_audit_logs').insert({
    action,
    performed_by: performedBy,
    target_type: targetType,
    target_id: targetId,
    metadata: metadata || {},
  });
  if (error) logger.error('auditService', 'Failed to log audit', error);
}
