import { sb } from '@shared/core/supabase';
import { handleServiceError } from '@shared/core/serviceError.ts';
import { logger } from '@shared/utils/logger.ts';
import { localISODate } from '@shared/utils/dateUtils.ts';
import {
  isCountableInvoice, isOutstandingInvoice, isOverdueInvoice, invoicePaymentDate,
} from './arCalc.ts';
import type { Invoice, InvoiceLineItem, Bill, PayrollRun, FinanceSummary } from '@shared/types';

// The date cash actually left for an expense. `paid_at` is set when the expense
// is marked Paid; older rows fall back to the bill's own date.
export function billPaidDate(bill: Bill): string {
  return (bill.paid_at ?? bill.date ?? '').slice(0, 10);
}

// PostgREST reports a column the schema cache does not know about as PGRST204.
// It happens while a migration is still pending — the app ships before the SQL
// is run in the Supabase dashboard.
function isUnknownColumnError(error: { code?: string } | null): boolean {
  return error?.code === 'PGRST204';
}

// Update that degrades gracefully: if the table does not have the new columns
// yet, retry without them rather than failing the whole write. Marking an
// expense paid must not break just because paid_at has not been migrated in.
async function updateWithOptionalColumns(
  table: string,
  id: number,
  data: Record<string, unknown>,
  optionalColumns: ReadonlyArray<string>,
  context: string,
): Promise<boolean> {
  const { error } = await sb.from(table).update(data).eq('id', id);
  if (!error) return true;

  const hasOptional = optionalColumns.some(col => col in data);
  if (!isUnknownColumnError(error) || !hasOptional) {
    handleServiceError(context, error);
    return false;
  }

  const fallback = { ...data };
  for (const col of optionalColumns) delete fallback[col];
  const { error: retryError } = await sb.from(table).update(fallback).eq('id', id);
  if (retryError) { handleServiceError(context, retryError); return false; }
  logger.warn(context, `Saved without ${optionalColumns.join(', ')} — run the pending migration in Supabase.`);
  return true;
}

export async function fetchLineItems(invoiceId: number): Promise<InvoiceLineItem[]> {
  const { data, error } = await sb
    .from('invoice_line_items')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('id');
  if (error) { handleServiceError('fetchLineItems', error); return []; }
  return (data ?? []) as InvoiceLineItem[];
}

export async function upsertLineItems(invoiceId: number, items: InvoiceLineItem[]): Promise<boolean> {
  const { error: delError } = await sb.from('invoice_line_items').delete().eq('invoice_id', invoiceId);
  if (delError) { handleServiceError('upsertLineItems:delete', delError); return false; }
  if (!items.length) return true;
  const rows = items.map(({ description, quantity, unit_price, vat_rate }) => ({
    invoice_id: invoiceId, description, quantity, unit_price, vat_rate,
  }));
  const { error: insError } = await sb.from('invoice_line_items').insert(rows);
  if (insError) { handleServiceError('upsertLineItems:insert', insError); return false; }
  return true;
}

export async function fetchInvoices(): Promise<Invoice[]> {
  const { data, error } = await sb.from('invoices').select('*').order('date', { ascending: false });
  if (error) { handleServiceError('fetchInvoices', error); return []; }
  return (data ?? []) as Invoice[];
}

export async function createInvoice(data: Partial<Invoice>): Promise<Invoice | null> {
  const { data: result, error } = await sb.from('invoices').insert(data).select();
  if (error) { handleServiceError('createInvoice', error); return null; }
  return (result as Invoice[] | null)?.[0] ?? null;
}

export async function updateInvoice(id: number, data: Partial<Invoice>): Promise<boolean> {
  const { error } = await sb.from('invoices').update(data).eq('id', id);
  if (error) { handleServiceError('updateInvoice', error); return false; }
  return true;
}

export async function deleteInvoice(id: number): Promise<boolean> {
  const { error } = await sb.from('invoices').delete().eq('id', id);
  if (error) { handleServiceError('deleteInvoice', error); return false; }
  return true;
}

export async function fetchBills(): Promise<Bill[]> {
  const { data, error } = await sb.from('bills').select('*').order('date', { ascending: false });
  if (error) { handleServiceError('fetchBills', error); return []; }
  return (data ?? []) as Bill[];
}

export async function createBill(data: Partial<Bill>): Promise<Bill | null> {
  const { data: result, error } = await sb.from('bills').insert(data).select();
  if (error) { handleServiceError('createBill', error); return null; }
  return (result as Bill[] | null)?.[0] ?? null;
}

export async function updateBill(id: number, data: Partial<Bill>): Promise<boolean> {
  return updateWithOptionalColumns('bills', id, data, ['paid_at'], 'updateBill');
}

export async function deleteBill(id: number): Promise<boolean> {
  const { error } = await sb.from('bills').delete().eq('id', id);
  if (error) { handleServiceError('deleteBill', error); return false; }
  return true;
}

export async function fetchPayrollRuns(): Promise<PayrollRun[]> {
  const { data, error } = await sb.from('payroll_runs').select('*').order('period', { ascending: false });
  if (error) { handleServiceError('fetchPayrollRuns', error); return []; }
  return (data ?? []) as PayrollRun[];
}

export async function createPayrollRun(data: Partial<PayrollRun>): Promise<PayrollRun | null> {
  const { data: result, error } = await sb.from('payroll_runs').insert(data).select();
  if (error) { handleServiceError('createPayrollRun', error); return null; }
  return (result as PayrollRun[] | null)?.[0] ?? null;
}

export async function updatePayrollRun(id: number, data: Partial<PayrollRun>): Promise<boolean> {
  return updateWithOptionalColumns('payroll_runs', id, data, ['released_at'], 'updatePayrollRun');
}

export async function deletePayrollRun(id: number): Promise<boolean> {
  const { error } = await sb.from('payroll_runs').delete().eq('id', id);
  if (error) { handleServiceError('deletePayrollRun', error); return false; }
  return true;
}

export function calcFinanceSummary(
  invoices: Invoice[],
  bills: Bill[],
  payrollRuns: PayrollRun[] = [],
  now: Date = new Date(),
): FinanceSummary {
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const today = localISODate(now);

  // Archived and cancelled documents are hidden from every table, so they must
  // not sit in the totals either — otherwise cancelling an invoice leaves the
  // Outstanding card unchanged while the table below it drops the row.
  const liveInvoices = invoices.filter(isCountableInvoice);
  const paidInvoices = liveInvoices.filter(i => i.status === 'Paid');
  const liveBills    = bills.filter(b => !b.archived_at);
  const paidBills    = liveBills.filter(b => b.status === 'Paid');

  const arOutstanding    = liveInvoices.filter(isOutstandingInvoice).reduce((s, i) => s + (i.amount || 0), 0);
  const apOutstanding    = liveBills.filter(b => !['Paid', 'Cancelled'].includes(b.status)).reduce((s, b) => s + (b.amount || 0), 0);
  const revenueCollected = paidInvoices.reduce((s, i) => s + (i.amount || 0), 0);
  const expensesPaid     = paidBills.reduce((s, b) => s + (b.amount || 0), 0);

  const collectedThisMonth = paidInvoices
    .filter(i => invoicePaymentDate(i).startsWith(thisMonth))
    .reduce((s, i) => s + (i.amount || 0), 0);

  const expensesPaidThisMonth = paidBills
    .filter(b => billPaidDate(b).startsWith(thisMonth))
    .reduce((s, b) => s + (b.amount || 0), 0);

  // Derived, not stored — nothing in the app ever wrote the 'Overdue' status.
  const overdueInvoices = liveInvoices.filter(i => isOverdueInvoice(i, today));
  const pendingBills    = liveBills.filter(b => !['Paid', 'Cancelled'].includes(b.status));
  const payrollDue      = payrollRuns.filter(p => p.status === 'Pending').reduce((s, p) => s + (p.net || 0), 0);

  const collectedToday = paidInvoices
    .filter(i => invoicePaymentDate(i) === today)
    .reduce((s, i) => s + (i.amount || 0), 0);

  const paidWithDates = paidInvoices.filter(i => i.date && i.payment_date);
  const avgCollectionDays = paidWithDates.length === 0 ? 0 : Math.round(
    paidWithDates.reduce((s, i) => {
      const diff = new Date(i.payment_date!).getTime() - new Date(i.date!).getTime();
      return s + diff / (1000 * 60 * 60 * 24);
    }, 0) / paidWithDates.length
  );

  return {
    arOutstanding,
    apOutstanding,
    netPosition: revenueCollected - apOutstanding,
    revenueCollected,
    collectedThisMonth,
    expensesPaid,
    netProfit: revenueCollected - expensesPaid,
    overdueCount: overdueInvoices.length,
    overdueTotal: overdueInvoices.reduce((s, i) => s + (i.amount || 0), 0),
    pendingBillsCount: pendingBills.length,
    payrollDue,
    cashFlowThisMonth: collectedThisMonth - expensesPaidThisMonth,
    collectedToday,
    avgCollectionDays,
  };
}
