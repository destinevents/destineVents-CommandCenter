import { describe, it, expect } from 'vitest';
import type { FinancialAccount, CashLedgerEntry } from '@shared/types.ts';
import { accountForPaymentMethod, defaultAccount, ledgerRowChanges } from './ledgerPosting.ts';

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

describe('ledgerPosting — accountForPaymentMethod', () => {
  const accounts = [
    acct({ id: 1, name: 'Cash on Hand', type: 'cash' }),
    acct({ id: 2, name: 'BPI', type: 'bank' }),
    acct({ id: 3, name: 'GCash', type: 'ewallet', is_default: true }),
  ];

  it('sends each method to the kind of account it settles into', () => {
    expect(accountForPaymentMethod('Cash', accounts)?.id).toBe(1);
    expect(accountForPaymentMethod('Bank Transfer', accounts)?.id).toBe(2);
    expect(accountForPaymentMethod('Check', accounts)?.id).toBe(2);
    expect(accountForPaymentMethod('GCash', accounts)?.id).toBe(3);
    expect(accountForPaymentMethod('Maya', accounts)?.id).toBe(3);
  });

  // These two only exist in the Record Payment modal's list, not PAYMENT_METHODS.
  it('handles the payment-modal-only methods', () => {
    expect(accountForPaymentMethod('BPI', accounts)?.id).toBe(2);
    expect(accountForPaymentMethod('PayMongo', accounts)?.id).toBe(2);
  });

  it('ignores casing and stray whitespace', () => {
    expect(accountForPaymentMethod('  cash  ', accounts)?.id).toBe(1);
  });

  it('falls back to the default account for an unknown or missing method', () => {
    expect(accountForPaymentMethod('Other', accounts)?.id).toBe(3);
    expect(accountForPaymentMethod(null, accounts)?.id).toBe(3);
    expect(accountForPaymentMethod(undefined, accounts)?.id).toBe(3);
  });

  // An org with one account must behave exactly as it did before routing existed.
  it('falls back to the default when no account of that type exists', () => {
    const onlyEwallet = [acct({ id: 9, name: 'GCash', type: 'ewallet', is_default: true })];
    expect(accountForPaymentMethod('Cash', onlyEwallet)?.id).toBe(9);
    expect(accountForPaymentMethod('Bank Transfer', onlyEwallet)?.id).toBe(9);
  });

  it('skips inactive accounts of the right type', () => {
    const withRetired = [
      acct({ id: 4, name: 'Old wallet', type: 'cash', is_active: false }),
      acct({ id: 5, name: 'Petty cash', type: 'cash' }),
    ];
    expect(accountForPaymentMethod('Cash', withRetired)?.id).toBe(5);
  });

  it('prefers the default account when several share a type', () => {
    const twoBanks = [
      acct({ id: 6, name: 'BPI', type: 'bank' }),
      acct({ id: 7, name: 'BDO', type: 'bank', is_default: true }),
    ];
    expect(accountForPaymentMethod('Bank Transfer', twoBanks)?.id).toBe(7);
  });

  it('returns null when there are no accounts at all', () => {
    expect(accountForPaymentMethod('Cash', [])).toBeNull();
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

  // notes and attachments belong to whoever keeps the books, not to the source
  // document, so a sync must leave them alone.
  it('never touches fields outside the synced set', () => {
    expect(ledgerRowChanges(row(), {
      notes: 'bookkeeper note', attachment_url: 'https://example.test/r.pdf',
    } as Partial<CashLedgerEntry>)).toBeNull();
  });

  it('moves the row when the payment method sent it to another account', () => {
    expect(ledgerRowChanges(row({ account_id: 3 }), { account_id: 1 })).toEqual({ account_id: 1 });
  });
});
