// Tests the SHIPPED services/proposalService.js. `globals: true` provides describe/it/expect.
import { calcWinRate } from './proposalService.js';

const p = (status, value = 0) => ({ status, value });

describe('calcWinRate', () => {
  it('calculates win rate as percentage of closed proposals', () => {
    const result = calcWinRate([p('Won'), p('Won'), p('Lost')]);
    expect(result.winRate).toBe(67);
  });

  it('returns 0 win rate when no proposals are closed', () => {
    const result = calcWinRate([p('Sent'), p('Sent')]);
    expect(result.winRate).toBe(0);
  });

  it('sums pipeline value from Sent proposals only', () => {
    const result = calcWinRate([p('Sent', 5000), p('Won', 3000), p('Sent', 2000)]);
    expect(result.pipelineValue).toBe(7000);
  });

  it('counts total, won, and lost correctly', () => {
    const result = calcWinRate([p('Won'), p('Lost'), p('Sent'), p('Expired')]);
    expect(result.total).toBe(4);
    expect(result.won).toBe(1);
    expect(result.lost).toBe(1);
  });

  it('returns zeros for empty array', () => {
    const result = calcWinRate([]);
    expect(result.total).toBe(0);
    expect(result.winRate).toBe(0);
  });
});
