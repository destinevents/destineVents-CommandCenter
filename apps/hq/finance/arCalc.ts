// Pure, DOM-free derivations for Accounts Receivable. Kept out of
// financeService.ts so they can be unit-tested without a Supabase client.
//
// The key idea: "Overdue" is *derived* from the due date, never stored. Nothing
// in the app ever wrote the 'Overdue' status, so the Overdue stat card sat at
// ₱0 forever. Deriving it means the card is correct the moment a due date
// passes, with no cron job and no migration.
import type { Invoice } from '@shared/types.ts';

// Statuses that mean the invoice is settled or void — no longer money owed.
export const AR_CLOSED_STATUSES: ReadonlyArray<string> = ['Paid', 'Cancelled'];

// Archived invoices are hidden from every table, so they must not count towards
// any figure either. This is the single gate every AR total goes through.
export function isCountableInvoice(invoice: Invoice): boolean {
  return !invoice.archived_at;
}

// Still owed: not archived, not paid, not cancelled.
export function isOutstandingInvoice(invoice: Invoice): boolean {
  return isCountableInvoice(invoice) && !AR_CLOSED_STATUSES.includes(invoice.status);
}

// Overdue = outstanding and past its due date. `today` is an ISO date string
// (YYYY-MM-DD) so the caller controls the clock and tests stay deterministic.
export function isOverdueInvoice(invoice: Invoice, today: string): boolean {
  if (!isOutstandingInvoice(invoice)) return false;
  const due = (invoice.due ?? '').slice(0, 10);
  if (!due) return false;
  return due < today;
}

// What the badge should say. The stored status is respected unless the invoice
// has quietly slipped past its due date.
export function invoiceDisplayStatus(invoice: Invoice, today: string): string {
  return isOverdueInvoice(invoice, today) ? 'Overdue' : invoice.status;
}

// The date a payment actually landed. Falls back to the issue date only as a
// last resort — see the note in calcFinanceSummary about why that fallback
// makes "Collected This Month" drift.
export function invoicePaymentDate(invoice: Invoice): string {
  return (invoice.payment_date ?? invoice.date ?? '').slice(0, 10);
}
