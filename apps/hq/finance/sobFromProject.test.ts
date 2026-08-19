import { describe, it, expect } from 'vitest';
import {
  sobLineItemsFor, shouldAdvanceOnBilling, dueDateFrom, defaultPaymentInstructions,
} from './sobFromProject.ts';
import type { Project, ProposalLineItem } from '@shared/types.ts';

const project = (over: Partial<Project> = {}): Project => ({
  id: 4, name: 'Abanao Square — Easter Event', code: 'PRJ-2026-001',
  proposal_id: 7, client: 'Abanao Square', value: 5000, status: 'Proposal Approved',
  ...over,
} as Project);

const line = (over: Partial<ProposalLineItem> = {}): ProposalLineItem => ({
  description: 'Event styling', quantity: 2, unit_price: 1500, vat_rate: 12,
  ...over,
} as ProposalLineItem);

describe('sobLineItemsFor', () => {
  // The whole point: the quotation was itemised once, so the statement — and
  // the invoice converted from it — should not be typed again.
  it('carries the quotation line for line, VAT included', () => {
    const items = sobLineItemsFor(project(), [line(), line({ description: 'Venue', quantity: 1, unit_price: 2000, vat_rate: 0 })]);
    expect(items).toEqual([
      { description: 'Event styling', quantity: 2, unit_price: 1500, vat_rate: 12 },
      { description: 'Venue', quantity: 1, unit_price: 2000, vat_rate: 0 },
    ]);
  });

  it('bills the project as one line when no quotation stands behind it', () => {
    const items = sobLineItemsFor(project({ proposal_id: null }), []);
    expect(items).toEqual([
      { description: 'Abanao Square — Easter Event', quantity: 1, unit_price: 5000, vat_rate: 0 },
    ]);
  });

  // A quotation saved with an empty starter row would otherwise produce a
  // statement whose only line is blank, which bills ₱0 and is refused on save.
  it('ignores blank rows left behind on the quotation', () => {
    const items = sobLineItemsFor(project(), [line({ description: '  ', unit_price: 0, quantity: 0 })]);
    expect(items).toHaveLength(1);
    expect(items[0].unit_price).toBe(5000);
  });

  it('falls back to ₱0 rather than NaN on a project with no value', () => {
    const items = sobLineItemsFor(project({ value: undefined as unknown as number }), []);
    expect(items[0].unit_price).toBe(0);
  });
});

describe('shouldAdvanceOnBilling', () => {
  it('advances a project that is waiting to be billed', () => {
    expect(shouldAdvanceOnBilling(project())).toBe(true);
  });

  // A second statement against an invoiced project must not walk it backwards.
  it('leaves a project that is already further along', () => {
    ['Statement of Billing', 'Invoice', 'Payment', 'Official Receipt', 'Completed']
      .forEach(status => expect(shouldAdvanceOnBilling(project({ status }))).toBe(false));
  });

  it('leaves a project that never entered the pipeline', () => {
    expect(shouldAdvanceOnBilling(project({ status: 'Active' }))).toBe(false);
    expect(shouldAdvanceOnBilling(undefined)).toBe(false);
  });
});

describe('dueDateFrom', () => {
  it('adds the payment term to the issue date', () => {
    expect(dueDateFrom('2026-08-19', 30)).toBe('2026-09-18');
  });

  it('rolls over a year end', () => {
    expect(dueDateFrom('2026-12-15', 30)).toBe('2027-01-14');
  });

  it('returns nothing for an unusable issue date rather than an invalid one', () => {
    expect(dueDateFrom('', 30)).toBe('');
    expect(dueDateFrom('not-a-date', 30)).toBe('');
  });
});

describe('defaultPaymentInstructions', () => {
  it('reads the bank details out of settings', () => {
    expect(defaultPaymentInstructions()).toContain('8129-1500-42');
  });
});
