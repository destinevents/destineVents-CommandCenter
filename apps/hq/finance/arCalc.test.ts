import { describe, it, expect } from 'vitest';
import type { Invoice } from '@shared/types.ts';
import {
  isCountableInvoice, isOutstandingInvoice, isOverdueInvoice,
  invoiceDisplayStatus, invoicePaymentDate,
} from './arCalc.ts';

const TODAY = '2026-08-06';

const inv = (over: Partial<Invoice> = {}) => ({
  id: 1, status: 'Issued', amount: 1000, due: null, date: null,
  payment_date: null, archived_at: null,
  ...over,
} as unknown as Invoice);

describe('isCountableInvoice', () => {
  it('counts a live invoice', () => {
    expect(isCountableInvoice(inv())).toBe(true);
  });

  it('excludes an archived invoice', () => {
    expect(isCountableInvoice(inv({ archived_at: '2026-08-01T00:00:00Z' }))).toBe(false);
  });
});

describe('isOutstandingInvoice', () => {
  it('counts an issued invoice as still owed', () => {
    expect(isOutstandingInvoice(inv({ status: 'Issued' }))).toBe(true);
  });

  it('excludes a paid invoice', () => {
    expect(isOutstandingInvoice(inv({ status: 'Paid' }))).toBe(false);
  });

  it('excludes a cancelled invoice', () => {
    expect(isOutstandingInvoice(inv({ status: 'Cancelled' }))).toBe(false);
  });

  it('excludes an archived but unpaid invoice', () => {
    expect(isOutstandingInvoice(inv({ status: 'Issued', archived_at: '2026-08-01' }))).toBe(false);
  });
});

describe('isOverdueInvoice', () => {
  it('flags an unpaid invoice past its due date', () => {
    expect(isOverdueInvoice(inv({ due: '2026-08-05' }), TODAY)).toBe(true);
  });

  it('does not flag an invoice due today', () => {
    expect(isOverdueInvoice(inv({ due: TODAY }), TODAY)).toBe(false);
  });

  it('does not flag an invoice due tomorrow', () => {
    expect(isOverdueInvoice(inv({ due: '2026-08-07' }), TODAY)).toBe(false);
  });

  it('does not flag an invoice with no due date', () => {
    expect(isOverdueInvoice(inv({ due: null }), TODAY)).toBe(false);
  });

  it('does not flag a paid invoice even when past due', () => {
    expect(isOverdueInvoice(inv({ status: 'Paid', due: '2026-01-01' }), TODAY)).toBe(false);
  });

  it('does not flag a cancelled invoice even when past due', () => {
    expect(isOverdueInvoice(inv({ status: 'Cancelled', due: '2026-01-01' }), TODAY)).toBe(false);
  });

  it('does not flag an archived invoice even when past due', () => {
    expect(isOverdueInvoice(inv({ due: '2026-01-01', archived_at: '2026-02-01' }), TODAY)).toBe(false);
  });

  it('tolerates a full timestamp in the due field', () => {
    expect(isOverdueInvoice(inv({ due: '2026-08-05T14:30:00Z' }), TODAY)).toBe(true);
  });
});

describe('invoiceDisplayStatus', () => {
  it('reports Overdue for a past-due issued invoice', () => {
    expect(invoiceDisplayStatus(inv({ status: 'Issued', due: '2026-08-01' }), TODAY)).toBe('Overdue');
  });

  it('keeps the stored status when not past due', () => {
    expect(invoiceDisplayStatus(inv({ status: 'Issued', due: '2026-09-01' }), TODAY)).toBe('Issued');
  });

  it('keeps Paid for a settled invoice', () => {
    expect(invoiceDisplayStatus(inv({ status: 'Paid', due: '2026-01-01' }), TODAY)).toBe('Paid');
  });
});

describe('invoicePaymentDate', () => {
  it('prefers the payment date', () => {
    expect(invoicePaymentDate(inv({ payment_date: '2026-08-06', date: '2026-06-01' }))).toBe('2026-08-06');
  });

  it('falls back to the issue date', () => {
    expect(invoicePaymentDate(inv({ payment_date: null, date: '2026-06-01' }))).toBe('2026-06-01');
  });

  it('returns an empty string when neither is set', () => {
    expect(invoicePaymentDate(inv())).toBe('');
  });
});
