import { sb } from '@shared/core/supabase';
import { handleServiceError } from '@shared/core/serviceError.ts';
import type { PurchaseOrder, POLineItem } from '@shared/types';

export async function fetchPurchaseOrders(): Promise<PurchaseOrder[]> {
  const { data, error } = await sb
    .from('purchase_orders')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { handleServiceError('fetchPurchaseOrders', error); return []; }
  return (data ?? []) as PurchaseOrder[];
}

export async function fetchPOLineItems(poId: number): Promise<POLineItem[]> {
  const { data, error } = await sb
    .from('purchase_order_line_items')
    .select('*')
    .eq('po_id', poId)
    .order('id');
  if (error) { handleServiceError('fetchPOLineItems', error); return []; }
  return (data ?? []) as POLineItem[];
}

export async function upsertPOLineItems(poId: number, items: POLineItem[]): Promise<boolean> {
  const { error: delErr } = await sb.from('purchase_order_line_items').delete().eq('po_id', poId);
  if (delErr) { handleServiceError('upsertPOLineItems:delete', delErr); return false; }
  if (!items.length) return true;
  const rows = items.map(({ description, quantity, unit_price, vat_rate }) => ({
    po_id: poId, description, quantity, unit_price, vat_rate,
  }));
  const { error: insErr } = await sb.from('purchase_order_line_items').insert(rows);
  if (insErr) { handleServiceError('upsertPOLineItems:insert', insErr); return false; }
  return true;
}

export async function createPurchaseOrder(data: Partial<PurchaseOrder>): Promise<PurchaseOrder | null> {
  const { data: result, error } = await sb.from('purchase_orders').insert(data).select();
  if (error) { handleServiceError('createPurchaseOrder', error); return null; }
  return (result as PurchaseOrder[] | null)?.[0] ?? null;
}

export async function updatePurchaseOrder(id: number, data: Partial<PurchaseOrder>): Promise<boolean> {
  const { error } = await sb.from('purchase_orders').update(data).eq('id', id);
  if (error) { handleServiceError('updatePurchaseOrder', error); return false; }
  return true;
}

export async function deletePurchaseOrder(id: number): Promise<boolean> {
  const { error } = await sb.from('purchase_orders').delete().eq('id', id);
  if (error) { handleServiceError('deletePurchaseOrder', error); return false; }
  return true;
}
