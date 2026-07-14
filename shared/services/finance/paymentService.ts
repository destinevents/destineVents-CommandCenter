import { sb } from '@shared/services/core/supabase';
import { handleServiceError } from '@shared/services/core/serviceError.ts';
import type { Payment } from '@shared/types';

export async function createEventCheckout(params: {
  eventId: number;
  registrationId: number;
  amount: number;
  description: string;
}): Promise<{ checkoutUrl: string; paymentId: string } | null> {
  const origin = window.location.origin;
  const successUrl = `${origin}/payment-success.html?ref=${params.registrationId}&type=event`;
  const cancelUrl  = `${origin}/register.html?event=${params.eventId}&cancelled=1`;

  try {
    const res = await fetch('/api/payments/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, successUrl, cancelUrl }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    return data as { checkoutUrl: string; paymentId: string };
  } catch (error) {
    handleServiceError('createEventCheckout', error as { message?: string });
    return null;
  }
}

export async function createInvoicePaymentLink(params: {
  invoiceId: number;
  amount: number;
  description: string;
}): Promise<{ paymentUrl: string; paymentId: string } | null> {
  try {
    const res = await fetch('/api/payments/create-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    return data as { paymentUrl: string; paymentId: string };
  } catch (error) {
    handleServiceError('createInvoicePaymentLink', error as { message?: string });
    return null;
  }
}

export async function fetchPaymentById(id: string): Promise<Payment | null> {
  const { data, error } = await sb.from('payments').select('*').eq('id', id).single();
  if (error) { handleServiceError('fetchPaymentById', error); return null; }
  return data as Payment;
}
