// What status a project can hold, and which of them a person is allowed to set
// by hand.
//
// A project has exactly one lifecycle, and it is the billing pipeline. It starts
// when a quotation is won and ends when the job is closed. There is no separate
// list for the Projects page — the edit form and Finance read this file, so the
// two cannot drift apart the way they did when each kept its own array.
//
// Pure and DOM-free, like docTransitions.ts, so it is trivially testable.

import type { Invoice, Project } from '@shared/types.ts';
import { formatCurrency } from '@shared/utils/formatUtils.ts';

export const PROJECT_PIPELINE = [
  'Proposal Approved',
  'Statement of Billing',
  'Invoice',
  'Payment',
  'Official Receipt',
  'Completed',
] as const;

export type ProjectStatus = typeof PROJECT_PIPELINE[number];

// A project is at one of these because a document exists — an SOB was raised, an
// invoice was issued, a payment was recorded, a receipt was written. The status
// is a consequence of the paperwork, not an opinion about it, so the edit form
// shows it and refuses to set it. Finance moves it when the document is made.
//
// The same principle as _syncLinkedProposalValue refusing to overwrite an
// itemised quotation's total: never let a field contradict the document it
// describes.
const DOCUMENT_DERIVED: readonly string[] = [
  'Statement of Billing',
  'Invoice',
  'Payment',
  'Official Receipt',
];

// The two a person may choose. 'Proposal Approved' is where a won quotation
// lands, and 'Completed' is a business decision — a CSR job, a cancelled one, or
// work settled outside HQ finishes without ever reaching an Official Receipt.
const SETTABLE: readonly string[] = ['Proposal Approved', 'Completed'];

export function isDocumentDerived(status: string): boolean {
  return DOCUMENT_DERIVED.includes(status);
}

// A project still moving through billing. Both the Billing Pipeline table and
// the dashboard's Active Projects card count this, so they cannot disagree.
export function isInFlight(status: string): boolean {
  return PROJECT_PIPELINE.includes(status as ProjectStatus) && status !== 'Completed';
}

export function pipelineIndex(status: string): number {
  return PROJECT_PIPELINE.indexOf(status as ProjectStatus);
}

// What the edit form's status dropdown may offer.
//
// A row still carrying a retired status — 'Lead', 'Proposal Sent', 'Active', or
// anything else predating this lifecycle — keeps that value at the front, so
// opening the form shows where the project actually is instead of silently
// moving it on save. That silent move is the bug this file exists to end.
export function statusOptions(current: string): string[] {
  if (isDocumentDerived(current)) return [current];
  if (!current || SETTABLE.includes(current)) return [...SETTABLE];
  return [current, ...SETTABLE];
}

// Why the form is showing a status rather than offering it.
export function documentDerivedNote(status: string): string {
  const source: Record<string, string> = {
    'Statement of Billing': 'a statement of billing was raised',
    'Invoice':              'an invoice was raised',
    'Payment':              'a payment was recorded',
    'Official Receipt':     'an official receipt was issued',
  };
  return `Set by Finance when ${source[status] ?? 'the document was raised'}. Advance it from the Billing Pipeline.`;
}

// Marking a project Completed takes it out of the Billing Pipeline for good.
// Done before the money was receipted, that is the last place the amount was
// visible: outstanding totals come from invoices, so a project completed with no
// invoice against it leaves nothing behind to say you are still owed for it.
//
// Returns the sentence to put in front of the person, or null when the project
// is fully receipted and completing it needs no second thought.
export function completionWarning(project: Project, invoices: Invoice[]): string | null {
  const mine = invoices.filter(i => i.project_id === project.id && !i.archived_at);
  const value = project.value || 0;

  if (!mine.length) {
    return value > 0
      ? `No invoice has ever been raised against this project, so its ${formatCurrency(value)} will not appear anywhere once it leaves the Billing Pipeline.`
      : null;
  }

  const received = mine
    .filter(i => i.status === 'Paid')
    .reduce((sum, i) => sum + (i.amount || 0), 0);
  const billed = mine.reduce((sum, i) => sum + (i.amount || 0), 0);
  const shortfall = Math.max(value, billed) - received;

  if (shortfall <= 0) return null;

  return `${formatCurrency(received)} of ${formatCurrency(Math.max(value, billed))} has been receipted on this project, leaving ${formatCurrency(shortfall)} uncollected.`;
}
