import { sb } from '@shared/core/supabase';
import { handleServiceError } from '@shared/core/serviceError.ts';
import type { Proposal, ProposalStats } from '@shared/types';

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

export function calcWinRate(proposals: Proposal[]): ProposalStats {
  const closed = proposals.filter(p => p.status === 'Won' || p.status === 'Lost');
  const won = proposals.filter(p => p.status === 'Won');
  const wonValue = won.reduce((s, p) => s + (p.value || 0), 0);
  const pipelineValue = proposals.filter(p => p.status === 'Sent').reduce((s, p) => s + (p.value || 0), 0);
  return {
    total: proposals.length,
    closed: closed.length,
    won: won.length,
    lost: proposals.filter(p => p.status === 'Lost').length,
    winRate: closed.length ? Math.round((won.length / closed.length) * 100) : 0,
    wonValue,
    pipelineValue,
  };
}
