// Integration bridge (§7): lets Accounts Receivable, Accounts Payable and
// Payroll auto-post into the Cash Ledger, and reverse those postings when a
// source document is deleted. Postings are idempotent — keyed on
// (source_type, source_id) so a document can never double-post.
import type { FinancialAccount, CashLedgerEntry } from '@shared/types.ts';
import {
  createLedgerEntry, deleteLedgerEntry, findLedgerBySource, updateLedgerEntry,
} from './ledgerService.ts';

export type LedgerSourceType = 'invoice' | 'bill' | 'payroll';
export type PostResult = 'posted' | 'exists' | 'no-account' | 'error';
export type SyncResult = PostResult | 'updated' | 'unchanged' | 'reversed';

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

// Fields the source document owns. If the document is edited after it was
// posted, these are the only values worth pushing back onto the ledger row — a
// bookkeeper's manual edits to anything else are left alone.
const SYNCED_FIELDS = [
  'cash_in', 'cash_out', 'txn_date', 'description', 'reference_no',
  'category', 'project_id', 'payment_method',
] as const;

// Pure diff: the subset of `desired` that differs from the row already stored,
// or null when the row is already correct. Keeps syncSourceLedger from firing
// a pointless UPDATE (and a pointless realtime reload) on every save.
export function ledgerRowChanges(
  existing: CashLedgerEntry,
  desired: Partial<CashLedgerEntry>,
): Partial<CashLedgerEntry> | null {
  const changes: Partial<CashLedgerEntry> = {};
  let changed = false;
  for (const field of SYNCED_FIELDS) {
    if (!(field in desired)) continue;
    const next = desired[field] ?? null;
    const prev = existing[field] ?? null;
    if (next !== prev) {
      (changes as Record<string, unknown>)[field] = next;
      changed = true;
    }
  }
  return changed ? changes : null;
}

// Keep the ledger in step with a source document across its whole life, not
// just the moment it is first marked paid.
//
// `isCash` says whether the document currently represents money that moved.
// Pass false and any rows it previously created are reversed — so un-paying or
// cancelling a document takes its figure back off the dashboard, and editing a
// paid document's amount or date corrects the row instead of leaving a stale one.
export async function syncSourceLedger(
  input: PostToLedgerInput & { isCash: boolean },
): Promise<SyncResult> {
  try {
    const existing = await findLedgerBySource(input.sourceType, input.sourceId);

    if (!input.isCash) {
      if (existing.length === 0) return 'unchanged';
      const ok = await reverseSourceFromLedger(input.sourceType, input.sourceId);
      return ok ? 'reversed' : 'error';
    }

    if (existing.length === 0) return postSourceToLedger(input);

    const desired: Partial<CashLedgerEntry> = {
      cash_in: input.cashIn ?? 0,
      cash_out: input.cashOut ?? 0,
      txn_date: input.txnDate || existing[0].txn_date,
      description: input.description,
      reference_no: input.referenceNo,
      category: input.category,
      project_id: input.projectId ?? null,
      payment_method: input.paymentMethod ?? null,
    };

    let updatedAny = false;
    for (const row of existing) {
      const changes = ledgerRowChanges(row, desired);
      if (!changes) continue;
      const ok = await updateLedgerEntry(row.id, changes);
      if (!ok) return 'error';
      updatedAny = true;
    }
    return updatedAny ? 'updated' : 'unchanged';
  } catch (error) {
    console.error('syncSourceLedger failed:', error);
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
