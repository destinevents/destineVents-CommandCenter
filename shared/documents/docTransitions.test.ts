import { describe, it, expect } from 'vitest';
import {
  canTransition, nextStatuses, statusOptions, explainTransitionError,
} from './docTransitions.ts';

// These mirror database/schema/hq/documents/doc-state-machine.sql. If a case here
// fails after a schema change, the SQL and this module have drifted apart.
describe('canTransition', () => {
  it('allows the moves the database allows', () => {
    expect(canTransition('quotation', 'Draft', 'Sent')).toBe(true);
    expect(canTransition('quotation', 'Sent', 'Won')).toBe(true);
    expect(canTransition('invoice', 'Draft', 'Issued')).toBe(true);
    expect(canTransition('invoice', 'Issued', 'Paid')).toBe(true);
    expect(canTransition('sob', 'Sent', 'Paid')).toBe(true);
    expect(canTransition('payroll', 'Pending', 'Paid')).toBe(true);
  });

  it('refuses the two jumps that broke the Aug 7 test run', () => {
    expect(canTransition('quotation', 'Draft', 'Won')).toBe(false);
    expect(canTransition('invoice', 'Draft', 'Paid')).toBe(false);
  });

  it('refuses moves backwards along the lifecycle', () => {
    expect(canTransition('invoice', 'Paid', 'Issued')).toBe(false);
    expect(canTransition('quotation', 'Won', 'Sent')).toBe(false);
    expect(canTransition('sob', 'Paid', 'Draft')).toBe(false);
  });

  it('treats a no-op as allowed, since the trigger returns early', () => {
    expect(canTransition('invoice', 'Paid', 'Paid')).toBe(true);
    expect(canTransition('quotation', 'Won', 'Won')).toBe(true);
  });

  it('lets a paid payroll run be corrected back to Pending', () => {
    expect(canTransition('payroll', 'Paid', 'Pending')).toBe(true);
  });

  it('returns nothing for an unknown status rather than throwing', () => {
    expect(nextStatuses('invoice', 'Unpaid')).toEqual([]);
    expect(canTransition('invoice', 'Unpaid', 'Paid')).toBe(false);
  });
});

describe('statusOptions', () => {
  it('offers where it is now plus where it can go', () => {
    expect(statusOptions('quotation', 'Draft')).toEqual(['Draft', 'Sent', 'Lost', 'Expired']);
    expect(statusOptions('invoice', 'Draft')).toEqual(['Draft', 'Issued', 'Cancelled']);
  });

  it('does not offer Won until a quotation has been sent', () => {
    expect(statusOptions('quotation', 'Draft')).not.toContain('Won');
    expect(statusOptions('quotation', 'Sent')).toContain('Won');
  });

  it('does not offer Paid until an invoice has been issued', () => {
    expect(statusOptions('invoice', 'Draft')).not.toContain('Paid');
    expect(statusOptions('invoice', 'Issued')).toContain('Paid');
  });

  it('lists options in lifecycle order, not map order', () => {
    expect(statusOptions('sob', 'Sent'))
      .toEqual(['Sent', 'Viewed', 'Partially Paid', 'Paid', 'Cancelled']);
  });

  it('always includes the current status', () => {
    const kinds = ['quotation', 'sob', 'invoice', 'payroll'] as const;
    for (const kind of kinds) {
      for (const status of statusOptions(kind, 'Draft')) {
        expect(statusOptions(kind, status)).toContain(status);
      }
    }
  });

  it('keeps a legacy status the lifecycle no longer knows about', () => {
    // Old invoices predate Draft/Issued and sit on 'Unpaid'. Dropping it from the
    // dropdown would silently rewrite the record on the next save.
    expect(statusOptions('invoice', 'Unpaid')).toContain('Unpaid');
  });

  it('offers only the current status when a document is finished', () => {
    expect(statusOptions('quotation', 'Won')).toEqual(['Won']);
    expect(statusOptions('invoice', 'Paid')).toEqual(['Paid']);
  });
});

describe('explainTransitionError', () => {
  it('explains the invoice case in plain language', () => {
    expect(explainTransitionError('Invalid Invoice status transition: Draft → Paid'))
      .toBe('An invoice cannot go straight from Draft to Paid. From Draft it can only become Issued or Cancelled.');
  });

  it('explains the quotation case in plain language', () => {
    expect(explainTransitionError('Invalid Quotation status transition: Draft → Won'))
      .toBe('A quotation cannot go straight from Draft to Won. From Draft it can only become Sent, Lost or Expired.');
  });

  it('calls an SOB a billing statement', () => {
    expect(explainTransitionError('Invalid SOB status transition: Draft → Paid'))
      .toContain('A billing statement cannot go straight from Draft to Paid');
  });

  it('says so when the starting status is terminal', () => {
    expect(explainTransitionError('Invalid Invoice status transition: Paid → Draft'))
      .toBe('An invoice cannot go straight from Paid to Draft. Paid is the end of the line.');
  });

  it('tolerates a plain ASCII arrow', () => {
    expect(explainTransitionError('Invalid Invoice status transition: Draft -> Paid'))
      .toContain('cannot go straight from Draft to Paid');
  });

  it('still explains a document type it has no map for', () => {
    expect(explainTransitionError('Invalid Widget status transition: A → B'))
      .toBe('A document cannot go straight from A to B.');
  });

  it('returns null for unrelated errors so the caller can fall back', () => {
    expect(explainTransitionError('duplicate key value violates unique constraint')).toBeNull();
    expect(explainTransitionError('')).toBeNull();
  });
});
