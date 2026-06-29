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
