// ESM version of shared/services/auditService.js (frozen classic copy kept for HQ).
import { sb } from './supabase';
import { logger } from '../utils/loggerUtils.ts';

export interface AuditLog {
  id: string;
  action: string;
  performed_by: string;
  target_type: string;
  target_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export async function fetchAuditLogs(limit = 200): Promise<AuditLog[]> {
  const { data, error } = await sb
    .from('intern_audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    logger.error('auditService', 'Failed to fetch audit logs', error);
    return [];
  }
  return (data as AuditLog[]) ?? [];
}

export async function logAudit(
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown> | null,
  performedBy: string
): Promise<void> {
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
