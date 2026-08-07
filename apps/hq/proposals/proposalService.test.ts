import { describe, it, expect } from 'vitest';
import type { Proposal } from '@shared/types.ts';
import { calcWinRate, proposalValue } from './proposalService.ts';

const p = (status: string, value = 0) => ({ status, value } as unknown as Proposal);
// A quotation carrying line-item totals as well as the legacy `value` column.
const priced = (status: string, total: number, value = 0) =>
  ({ status, value, total_amount: total } as unknown as Proposal);

describe('proposalValue', () => {
  it('prefers the line-item total when there is one', () => {
    expect(proposalValue(priced('Sent', 5000, 3000))).toBe(5000);
  });

  // quotation-upgrade.sql added total_amount with DEFAULT 0, so every quotation
  // written before it holds 0 rather than null — `??` showed those as ₱0.00.
  it('falls back to value when total_amount is a backfilled zero', () => {
    expect(proposalValue(priced('Sent', 0, 3000))).toBe(3000);
  });

  it('falls back to value when total_amount is missing entirely', () => {
    expect(proposalValue(p('Sent', 3000))).toBe(3000);
  });

  it('is zero when a quotation genuinely has no figure', () => {
    expect(proposalValue(p('Draft'))).toBe(0);
  });
});

describe('calcWinRate', () => {
  it('calculates win rate as percentage of closed proposals', () => {
    const result = calcWinRate([p('Won'), p('Won'), p('Lost')]);
    expect(result.winRate).toBe(67);
  });

  it('returns 0 win rate when no proposals are closed', () => {
    const result = calcWinRate([p('Sent'), p('Sent')]);
    expect(result.winRate).toBe(0);
  });

  it('sums pipeline value from every quotation still in play', () => {
    const result = calcWinRate([p('Sent', 5000), p('Won', 3000), p('Sent', 2000)]);
    expect(result.pipelineValue).toBe(7000);
  });

  // Counting only 'Sent' left drafts out of every figure on the page, so a
  // freshly written quotation showed as ₱0 until someone marked it sent.
  it('includes drafts in the pipeline', () => {
    const result = calcWinRate([p('Draft', 4000), p('Sent', 1000)]);
    expect(result.pipelineValue).toBe(5000);
    expect(result.open).toBe(2);
  });

  it('leaves settled quotations out of the pipeline', () => {
    const result = calcWinRate([p('Won', 9000), p('Lost', 8000), p('Expired', 7000)]);
    expect(result.pipelineValue).toBe(0);
    expect(result.open).toBe(0);
  });

  it('sums won value from the line-item total, not the legacy column', () => {
    const result = calcWinRate([priced('Won', 5000, 3000)]);
    expect(result.wonValue).toBe(5000);
  });

  it('still values older quotations that only have the legacy column', () => {
    const result = calcWinRate([priced('Sent', 0, 2500)]);
    expect(result.pipelineValue).toBe(2500);
  });

  it('counts total, won, lost and open correctly', () => {
    const result = calcWinRate([p('Won'), p('Lost'), p('Sent'), p('Expired')]);
    expect(result.total).toBe(4);
    expect(result.won).toBe(1);
    expect(result.lost).toBe(1);
    expect(result.open).toBe(1);       // Sent only — Expired is settled
  });

  it('returns zeros for empty array', () => {
    const result = calcWinRate([]);
    expect(result.total).toBe(0);
    expect(result.winRate).toBe(0);
  });
});
