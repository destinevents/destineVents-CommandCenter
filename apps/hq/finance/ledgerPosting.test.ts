import { describe, it, expect } from 'vitest';
import type { FinancialAccount, CashLedgerEntry } from '@shared/types.ts';
import { defaultAccount, ledgerRowChanges } from './ledgerPosting.ts';

const acct = (over: Partial<FinancialAccount>): FinancialAccount => ({
  id: 1, name: 'A', type: 'bank', opening_balance: 0, is_active: true,
  is_default: false, notes: null, created_at: '', ...over,
});

describe('ledgerPosting — defaultAccount', () => {
  it('prefers an active default account', () => {
    const accounts = [
      acct({ id: 1, is_default: false }),
      acct({ id: 2, is_default: true }),
    ];
    expect(defaultAccount(accounts)?.id).toBe(2);
  });

  it('falls back to the first active account when none is flagged default', () => {
    const accounts = [
      acct({ id: 1, is_active: false }),
      acct({ id: 2, is_active: true }),
    ];
    expect(defaultAccount(accounts)?.id).toBe(2);
  });

  it('returns null when there are no accounts', () => {
    expect(defaultAccount([])).toBeNull();
  });

  it('prefers an active default over an inactive default', () => {
    const accounts = [
      acct({ id: 1, is_default: true, is_active: false }),
      acct({ id: 2, is_default: true, is_active: true }),
    ];
    expect(defaultAccount(accounts)?.id).toBe(2);
  });
});

const row = (over: Partial<CashLedgerEntry> = {}) => ({
  id: 1, cash_in: 1000, cash_out: 0, txn_date: '2026-08-01',
  description: 'Client payment — Acme', reference_no: 'OR-2026-001',
  category: 'Client Payment', project_id: null, payment_method: 'GCash',
  ...over,
} as unknown as CashLedgerEntry);

describe('ledgerPosting — ledgerRowChanges', () => {
  it('returns null when the stored row already matches', () => {
    expect(ledgerRowChanges(row(), {
      cash_in: 1000, cash_out: 0, txn_date: '2026-08-01',
      description: 'Client payment — Acme', reference_no: 'OR-2026-001',
      category: 'Client Payment', project_id: null, payment_method: 'GCash',
    })).toBeNull();
  });

  it('picks up a corrected amount', () => {
    expect(ledgerRowChanges(row(), { cash_in: 2500 })).toEqual({ cash_in: 2500 });
  });

  it('picks up a corrected payment date', () => {
    expect(ledgerRowChanges(row(), { txn_date: '2026-08-06' })).toEqual({ txn_date: '2026-08-06' });
  });

  it('returns every changed field at once', () => {
    expect(ledgerRowChanges(row(), { cash_in: 2500, payment_method: 'BPI' }))
      .toEqual({ cash_in: 2500, payment_method: 'BPI' });
  });

  it('ignores fields the caller did not supply', () => {
    expect(ledgerRowChanges(row(), { cash_in: 1000 })).toBeNull();
  });

  it('treats undefined and null as the same absent value', () => {
    expect(ledgerRowChanges(row({ project_id: null }), { project_id: undefined })).toBeNull();
  });

  it('detects a newly linked project', () => {
    expect(ledgerRowChanges(row({ project_id: null }), { project_id: 7 })).toEqual({ project_id: 7 });
  });

  it('never touches fields outside the synced set', () => {
    expect(ledgerRowChanges(row(), { account_id: 99 } as Partial<CashLedgerEntry>)).toBeNull();
  });
});
