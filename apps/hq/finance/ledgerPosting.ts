// Integration bridge (§7): lets Accounts Receivable, Accounts Payable and
// Payroll auto-post into the Cash Ledger, and reverse those postings when a
// source document is deleted. Postings are idempotent — keyed on
// (source_type, source_id) so a document can never double-post.
import type { FinancialAccount, CashLedgerEntry } from '@shared/types.ts';
import {
  createLedgerEntry, deleteLedgerEntry, findLedgerBySource,
} from './ledgerService.ts';

export type LedgerSourceType = 'invoice' | 'bill' | 'payroll';
export type PostResult = 'posted' | 'exists' | 'no-account' | 'error';

// The account AR/AP/Payroll post into: the one flagged default, else the first
// active account. Returns null when the org has no usable account yet.
export function defaultAccount(accounts: FinancialAccount[]): FinancialAccount | null {
  return accounts.find(a => a.is_default && a.is_active)
    ?? accounts.find(a => a.is_default)
    ?? accounts.find(a => a.is_active)
    ?? null;
}

export interface PostToLedgerInput {
  sourceType: LedgerSourceType;
  sourceId: number;
  moduleSource: 'AR' | 'AP' | 'Payroll';
  category: string;
  description: string;
  txnDate: string | null;
  referenceNo: string | null;
  accounts: FinancialAccount[];
  projectId?: number | null;
  paymentMethod?: string | null;
  cashIn?: number;
  cashOut?: number;
  createdBy?: string | null;
}

// Create a ledger row for a source document if one does not already exist.
export async function postSourceToLedger(input: PostToLedgerInput): Promise<PostResult> {
  try {
    const existing = await findLedgerBySource(input.sourceType, input.sourceId);
    if (existing.length > 0) return 'exists';

    const account = defaultAccount(input.accounts);
    if (!account) return 'no-account';

    const payload: Partial<CashLedgerEntry> = {
      reference_no: input.referenceNo,
      txn_date: input.txnDate || new Date().toISOString().slice(0, 10),
      description: input.description,
      project_id: input.projectId ?? null,
      category: input.category,
      module_source: input.moduleSource,
      payment_method: input.paymentMethod ?? null,
      account_id: account.id,
      cash_in: input.cashIn ?? 0,
      cash_out: input.cashOut ?? 0,
      created_by: input.createdBy ?? null,
      source_type: input.sourceType,
      source_id: input.sourceId,
    };
    const result = await createLedgerEntry(payload);
    return result ? 'posted' : 'error';
  } catch (error) {
    console.error('postSourceToLedger failed:', error);
    return 'error';
  }
}

// Remove any ledger rows a source document created (called when the document is
// deleted). Returns true if all linked rows were removed (or there were none).
export async function reverseSourceFromLedger(
  sourceType: LedgerSourceType,
  sourceId: number,
): Promise<boolean> {
  try {
    const rows = await findLedgerBySource(sourceType, sourceId);
    let allOk = true;
    for (const row of rows) {
      const ok = await deleteLedgerEntry(row.id);
      if (!ok) allOk = false;
    }
    return allOk;
  } catch (error) {
    console.error('reverseSourceFromLedger failed:', error);
    return false;
  }
}
