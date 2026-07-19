import { sb } from '@shared/core/supabase.ts'

export type DocActivityType =
  | 'sob'
  | 'invoice'
  | 'bill'
  | 'payroll'
  | 'po'
  | 'quotation'
  | 'contract'

export type DocAction =
  | 'created'
  | 'updated'
  | 'sent'
  | 'viewed'
  | 'approved'
  | 'rejected'
  | 'paid'
  | 'released'
  | 'downloaded'
  | 'archived'
  | 'cancelled'
  | 'submitted'
  | 'signed'
  | 'fulfilled'

export interface DocActivityLog {
  id: number
  doc_type: DocActivityType
  doc_id: number
  doc_number: string | null
  action: DocAction
  performed_by: string | null
  notes: string | null
  created_at: string
}

export async function logDocActivity(
  docType: DocActivityType,
  docId: number,
  docNumber: string | null,
  action: DocAction,
  performedBy: string | null,
  notes?: string
): Promise<void> {
  const { error } = await sb.from('document_activity_logs').insert({
    doc_type: docType,
    doc_id: docId,
    doc_number: docNumber ?? null,
    action,
    performed_by: performedBy ?? null,
    notes: notes ?? null,
  })
  if (error) {
    console.error('logDocActivity failed:', error)
  }
}

export async function fetchDocActivity(
  docType: DocActivityType,
  docId: number
): Promise<DocActivityLog[]> {
  const { data, error } = await sb
    .from('document_activity_logs')
    .select('*')
    .eq('doc_type', docType)
    .eq('doc_id', docId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('fetchDocActivity failed:', error)
    return []
  }
  return (data ?? []) as DocActivityLog[]
}
