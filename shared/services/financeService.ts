import { sb } from './supabase';
import { handleServiceError } from './serviceError.ts';
import type { Invoice, InvoiceLineItem, Bill, PayrollRun, FinanceSummary } from '../types';

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
  const { error } = await sb.from('bills').update(data).eq('id', id);
  if (error) { handleServiceError('updateBill', error); return false; }
  return true;
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
  const { error } = await sb.from('payroll_runs').update(data).eq('id', id);
  if (error) { handleServiceError('updatePayrollRun', error); return false; }
  return true;
}

export async function deletePayrollRun(id: number): Promise<boolean> {
  const { error } = await sb.from('payroll_runs').delete().eq('id', id);
  if (error) { handleServiceError('deletePayrollRun', error); return false; }
  return true;
}

export function calcFinanceSummary(invoices: Invoice[], bills: Bill[], payrollRuns: PayrollRun[] = []): FinanceSummary {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const arOutstanding    = invoices.filter(i => i.status !== 'Paid').reduce((s, i) => s + (i.amount || 0), 0);
  const apOutstanding    = bills.filter(b => b.status !== 'Paid').reduce((s, b) => s + (b.amount || 0), 0);
  const revenueCollected = invoices.filter(i => i.status === 'Paid').reduce((s, i) => s + (i.amount || 0), 0);
  const expensesPaid     = bills.filter(b => b.status === 'Paid').reduce((s, b) => s + (b.amount || 0), 0);

  const collectedThisMonth = invoices
    .filter(i => i.status === 'Paid' && ((i.payment_date ?? i.date ?? '').startsWith(thisMonth)))
    .reduce((s, i) => s + (i.amount || 0), 0);

  const expensesPaidThisMonth = bills
    .filter(b => b.status === 'Paid' && (b.date ?? '').startsWith(thisMonth))
    .reduce((s, b) => s + (b.amount || 0), 0);

  const overdueInvoices = invoices.filter(i => i.status === 'Overdue');
  const pendingBills    = bills.filter(b => b.status !== 'Paid');
  const payrollDue      = payrollRuns.filter(p => p.status === 'Pending').reduce((s, p) => s + (p.net || 0), 0);

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
  };
}
