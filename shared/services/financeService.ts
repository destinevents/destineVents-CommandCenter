import { sb } from './supabase';
import { handleServiceError } from './serviceError.ts';
import type { Invoice, Bill, PayrollRun, FinanceSummary } from '../types';

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

export function calcFinanceSummary(invoices: Invoice[], bills: Bill[]): FinanceSummary {
  const arOutstanding = invoices.filter(i => i.status !== 'Paid').reduce((s, i) => s + (i.amount || 0), 0);
  const apOutstanding = bills.filter(b => b.status !== 'Paid').reduce((s, b) => s + (b.amount || 0), 0);
  const revenueCollected = invoices.filter(i => i.status === 'Paid').reduce((s, i) => s + (i.amount || 0), 0);
  const overdueInvoices = invoices.filter(i => i.status === 'Overdue');
  const pendingBills = bills.filter(b => b.status !== 'Paid');
  return {
    arOutstanding,
    apOutstanding,
    netPosition: revenueCollected - apOutstanding,
    revenueCollected,
    overdueCount: overdueInvoices.length,
    overdueTotal: overdueInvoices.reduce((s, i) => s + (i.amount || 0), 0),
    pendingBillsCount: pendingBills.length,
  };
}
