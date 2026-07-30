import { describe, it, expect } from 'vitest';
import type { FinancialAccount } from '@shared/types.ts';
import { defaultAccount } from './ledgerPosting.ts';

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
