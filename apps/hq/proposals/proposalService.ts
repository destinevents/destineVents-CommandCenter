import { sb } from '@shared/core/supabase';
import { handleServiceError } from '@shared/core/serviceError.ts';
import type { Proposal, ProposalStats, ProposalLineItem } from '@shared/types';

export async function fetchProposals(): Promise<Proposal[]> {
  const { data, error } = await sb.from('proposals').select('*').order('sent', { ascending: false });
  if (error) { handleServiceError('fetchProposals', error); return []; }
  return (data ?? []) as Proposal[];
}

export async function createProposal(data: Partial<Proposal>): Promise<Proposal | null> {
  const { data: result, error } = await sb.from('proposals').insert(data).select();
  if (error) { handleServiceError('createProposal', error); return null; }
  return (result as Proposal[] | null)?.[0] ?? null;
}

export async function updateProposal(id: number, data: Partial<Proposal>): Promise<boolean> {
  const { error } = await sb.from('proposals').update(data).eq('id', id);
  if (error) { handleServiceError('updateProposal', error); return false; }
  return true;
}

export async function deleteProposal(id: number): Promise<boolean> {
  const { error } = await sb.from('proposals').delete().eq('id', id);
  if (error) { handleServiceError('deleteProposal', error); return false; }
  return true;
}

export async function fetchProposalLineItems(proposalId: number): Promise<ProposalLineItem[]> {
  const { data, error } = await sb
    .from('proposal_line_items')
    .select('*')
    .eq('proposal_id', proposalId)
    .order('id');
  if (error) { handleServiceError('fetchProposalLineItems', error); return []; }
  return (data ?? []) as ProposalLineItem[];
}

export async function upsertProposalLineItems(proposalId: number, items: ProposalLineItem[]): Promise<boolean> {
  const { error: delErr } = await sb.from('proposal_line_items').delete().eq('proposal_id', proposalId);
  if (delErr) { handleServiceError('upsertProposalLineItems:delete', delErr); return false; }
  if (!items.length) return true;
  const rows = items.map(({ description, quantity, unit_price, vat_rate }) => ({
    proposal_id: proposalId, description, quantity, unit_price, vat_rate,
  }));
  const { error: insErr } = await sb.from('proposal_line_items').insert(rows);
  if (insErr) { handleServiceError('upsertProposalLineItems:insert', insErr); return false; }
  return true;
}

// What a quotation is worth, in one place.
//
// `total_amount` is the line-item total, but that column was added later by
// quotation-upgrade.sql with DEFAULT 0 — which backfilled every quotation that
// predates it with 0 rather than null. So `total_amount ?? value` resolved to
// 0 and every older quotation displayed as ₱0.00 while its real figure sat
// untouched in `value`. Treat 0 as "not set" and fall back.
export function proposalValue(p: Proposal): number {
  return p.total_amount || p.value || 0;
}

// A quotation is settled once it is Won, Lost or Expired. Everything else is
// still live — including drafts, which are work in hand even if they have not
// gone out yet. Counting only 'Sent' left drafts out of every figure on the
// page, so a freshly written quotation showed up as nothing.
const SETTLED_STATUSES = ['Won', 'Lost', 'Expired'];

export function calcWinRate(proposals: Proposal[]): ProposalStats {
  const closed = proposals.filter(p => p.status === 'Won' || p.status === 'Lost');
  const won = proposals.filter(p => p.status === 'Won');
  const sum = (list: Proposal[]) => list.reduce((s, p) => s + proposalValue(p), 0);
  const open = proposals.filter(p => !SETTLED_STATUSES.includes(p.status));
  return {
    total: proposals.length,
    closed: closed.length,
    won: won.length,
    lost: proposals.filter(p => p.status === 'Lost').length,
    open: open.length,
    winRate: closed.length ? Math.round((won.length / closed.length) * 100) : 0,
    wonValue: sum(won),
    pipelineValue: sum(open),
  };
}
