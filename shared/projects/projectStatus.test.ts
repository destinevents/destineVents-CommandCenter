import { describe, it, expect } from 'vitest';
import type { Invoice, Project } from '@shared/types.ts';
import {
  PROJECT_PIPELINE, isDocumentDerived, isInFlight, pipelineIndex,
  statusOptions, completionWarning,
} from './projectStatus.ts';

const project = (over: Partial<Project> = {}): Project => ({
  id: 1, name: 'DTI Summit', code: 'PRJ-2026-001', proposal_id: null,
  client: 'DTI', brand: 'DestineVents', category: 'Events',
  value: 400000, status: 'Proposal Approved', notes: null,
  created_at: '2026-01-01', updated_at: '2026-01-01',
  ...over,
});

const invoice = (over: Partial<Invoice> = {}): Invoice => ({
  id: 1, or_num: 'OR-2026-001', client: 'DTI', amount: 400000,
  subtotal: null, vat_amount: null, discount: null, notes: null,
  date: null, due: null, status: 'Issued', payment_method: null,
  payment_reference: null, payment_date: null, received_by: null,
  tin: null, business_address: null, project_id: 1, event_id: null,
  archived_at: null,
  ...over,
} as Invoice);

describe('the pipeline is the only lifecycle', () => {
  it('runs from an approved quotation to a closed job', () => {
    expect(PROJECT_PIPELINE[0]).toBe('Proposal Approved');
    expect(PROJECT_PIPELINE[PROJECT_PIPELINE.length - 1]).toBe('Completed');
  });

  it('no longer carries the retired statuses', () => {
    expect(PROJECT_PIPELINE).not.toContain('Lead');
    expect(PROJECT_PIPELINE).not.toContain('Proposal Sent');
    expect(PROJECT_PIPELINE).not.toContain('Active');
  });

  it('orders the stages so Finance can advance one at a time', () => {
    expect(pipelineIndex('Statement of Billing')).toBe(1);
    expect(pipelineIndex('Official Receipt')).toBeGreaterThan(pipelineIndex('Invoice'));
    expect(pipelineIndex('Lead')).toBe(-1);
  });
});

describe('isInFlight', () => {
  it('counts every stage still moving through billing', () => {
    expect(isInFlight('Proposal Approved')).toBe(true);
    expect(isInFlight('Payment')).toBe(true);
  });

  it('excludes a finished job and anything off the pipeline', () => {
    expect(isInFlight('Completed')).toBe(false);
    expect(isInFlight('Active')).toBe(false);
  });
});

describe('statusOptions', () => {
  it('offers only the two a person may decide', () => {
    expect(statusOptions('Proposal Approved')).toEqual(['Proposal Approved', 'Completed']);
  });

  it('refuses to offer a stage that a document set', () => {
    for (const s of ['Statement of Billing', 'Invoice', 'Payment', 'Official Receipt']) {
      expect(isDocumentDerived(s)).toBe(true);
      expect(statusOptions(s)).toEqual([s]);
    }
  });

  it('defaults a new project into the pipeline rather than a dead status', () => {
    expect(statusOptions('')[0]).toBe('Proposal Approved');
  });

  // The bug this module exists to end: a status with no matching option made the
  // browser select the first one, and saving wrote that over the real stage.
  it('keeps a retired status visible so saving cannot silently move it', () => {
    expect(statusOptions('Active')[0]).toBe('Active');
    expect(statusOptions('Lead')[0]).toBe('Lead');
    expect(statusOptions('Proposal Sent')).toContain('Completed');
  });
});

describe('completionWarning', () => {
  it('says nothing when the job was fully receipted', () => {
    const paid = invoice({ status: 'Paid', amount: 400000 });
    expect(completionWarning(project(), [paid])).toBeNull();
  });

  it('warns when the project was never invoiced at all', () => {
    expect(completionWarning(project(), [])).toMatch(/No invoice has ever been raised/);
  });

  it('stays quiet on a project worth nothing, so CSR work closes cleanly', () => {
    expect(completionWarning(project({ value: 0 }), [])).toBeNull();
  });

  it('warns when an invoice was raised but never paid', () => {
    expect(completionWarning(project(), [invoice({ status: 'Issued' })]))
      .toMatch(/uncollected/);
  });

  it('names the shortfall when only part was collected', () => {
    const part = [
      invoice({ id: 1, status: 'Paid',   amount: 150000 }),
      invoice({ id: 2, status: 'Issued', amount: 250000 }),
    ];
    expect(completionWarning(project(), part)).toContain('₱250,000');
  });

  it('ignores another project invoices and archived ones', () => {
    const noise = [
      invoice({ id: 2, project_id: 99, status: 'Paid', amount: 400000 }),
      invoice({ id: 3, status: 'Paid', amount: 400000, archived_at: '2026-02-01' }),
    ];
    expect(completionWarning(project(), noise)).toMatch(/No invoice has ever been raised/);
  });
});
