import { sb } from '@shared/core/supabase';
import { handleServiceError } from '@shared/core/serviceError.ts';
import type { FinancialAccount, CashLedgerEntry } from '@shared/types';

// ── Financial Accounts ────────────────────────────────────────────────────────

export async function fetchAccounts(): Promise<FinancialAccount[]> {
  const { data, error } = await sb
    .from('financial_accounts')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) { handleServiceError('fetchAccounts', error); return []; }
  return (data ?? []) as FinancialAccount[];
}

export async function createAccount(data: Partial<FinancialAccount>): Promise<FinancialAccount | null> {
  const { data: result, error } = await sb.from('financial_accounts').insert(data).select();
  if (error) { handleServiceError('createAccount', error); return null; }
  return (result as FinancialAccount[] | null)?.[0] ?? null;
}

export async function updateAccount(id: number, data: Partial<FinancialAccount>): Promise<boolean> {
  const { error } = await sb.from('financial_accounts').update(data).eq('id', id);
  if (error) { handleServiceError('updateAccount', error); return false; }
  return true;
}

export async function deleteAccount(id: number): Promise<boolean> {
  const { error } = await sb.from('financial_accounts').delete().eq('id', id);
  if (error) { handleServiceError('deleteAccount', error); return false; }
  return true;
}

// ── Cash Ledger ───────────────────────────────────────────────────────────────

export async function fetchLedger(): Promise<CashLedgerEntry[]> {
  const { data, error } = await sb
    .from('cash_ledger')
    .select('*')
    .order('txn_date', { ascending: false })
    .order('id', { ascending: false });
  if (error) { handleServiceError('fetchLedger', error); return []; }
  return (data ?? []) as CashLedgerEntry[];
}

// All ledger rows that originated from a given source document (invoice / bill /
// payroll run). Used to keep auto-posting idempotent and reversible.
export async function findLedgerBySource(sourceType: string, sourceId: number): Promise<CashLedgerEntry[]> {
  const { data, error } = await sb
    .from('cash_ledger')
    .select('*')
    .eq('source_type', sourceType)
    .eq('source_id', sourceId);
  if (error) { handleServiceError('findLedgerBySource', error); return []; }
  return (data ?? []) as CashLedgerEntry[];
}

export async function createLedgerEntry(data: Partial<CashLedgerEntry>): Promise<CashLedgerEntry | null> {
  const { data: result, error } = await sb.from('cash_ledger').insert(data).select();
  if (error) { handleServiceError('createLedgerEntry', error); return null; }
  return (result as CashLedgerEntry[] | null)?.[0] ?? null;
}

export async function updateLedgerEntry(id: number, data: Partial<CashLedgerEntry>): Promise<boolean> {
  const { error } = await sb.from('cash_ledger').update(data).eq('id', id);
  if (error) { handleServiceError('updateLedgerEntry', error); return false; }
  return true;
}

export async function deleteLedgerEntry(id: number): Promise<boolean> {
  const { error } = await sb.from('cash_ledger').delete().eq('id', id);
  if (error) { handleServiceError('deleteLedgerEntry', error); return false; }
  return true;
}
