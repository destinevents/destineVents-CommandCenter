import { sb } from './supabase';
import { handleServiceError } from './serviceError.ts';

export async function fetchInvoices() {
  const { data, error } = await sb.from('invoices').select('*').order('date', { ascending: false });
  if (error) { handleServiceError('fetchInvoices', error); return []; }
  return data;
}

export async function createInvoice(data) {
  const { data: result, error } = await sb.from('invoices').insert(data).select();
  if (error) { handleServiceError('createInvoice', error); return null; }
  return result?.[0] || null;
}

export async function updateInvoice(id, data) {
  const { error } = await sb.from('invoices').update(data).eq('id', id);
  if (error) { handleServiceError('updateInvoice', error); return false; }
  return true;
}

export async function deleteInvoice(id) {
  const { error } = await sb.from('invoices').delete().eq('id', id);
  if (error) { handleServiceError('deleteInvoice', error); return false; }
  return true;
}

export async function fetchBills() {
  const { data, error } = await sb.from('bills').select('*').order('date', { ascending: false });
  if (error) { handleServiceError('fetchBills', error); return []; }
  return data;
}

export async function createBill(data) {
  const { data: result, error } = await sb.from('bills').insert(data).select();
  if (error) { handleServiceError('createBill', error); return null; }
  return result?.[0] || null;
}

export async function updateBill(id, data) {
  const { error } = await sb.from('bills').update(data).eq('id', id);
  if (error) { handleServiceError('updateBill', error); return false; }
  return true;
}

export async function deleteBill(id) {
  const { error } = await sb.from('bills').delete().eq('id', id);
  if (error) { handleServiceError('deleteBill', error); return false; }
  return true;
}

export async function fetchPayrollRuns() {
  const { data, error } = await sb.from('payroll_runs').select('*').order('period', { ascending: false });
  if (error) { handleServiceError('fetchPayrollRuns', error); return []; }
  return data;
}

export async function createPayrollRun(data) {
  const { data: result, error } = await sb.from('payroll_runs').insert(data).select();
  if (error) { handleServiceError('createPayrollRun', error); return null; }
  return result?.[0] || null;
}

export async function updatePayrollRun(id, data) {
  const { error } = await sb.from('payroll_runs').update(data).eq('id', id);
  if (error) { handleServiceError('updatePayrollRun', error); return false; }
  return true;
}

export async function deletePayrollRun(id) {
  const { error } = await sb.from('payroll_runs').delete().eq('id', id);
  if (error) { handleServiceError('deletePayrollRun', error); return false; }
  return true;
}

export function calcFinanceSummary(invoices, bills) {
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

