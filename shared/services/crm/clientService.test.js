// Tests the SHIPPED services/clientService.js. `globals: true` provides describe/it/expect.
import { getClientTotalValue, findClientByName } from './clientService.ts';

describe('getClientTotalValue', () => {
  it('sums total_value from all clients', () => {
    expect(getClientTotalValue([{ total_value: 100 }, { total_value: 200 }])).toBe(300);
  });
  it('treats missing total_value as zero', () => {
    expect(getClientTotalValue([{ name: 'ACME' }])).toBe(0);
  });
  it('returns 0 for empty array', () => {
    expect(getClientTotalValue([])).toBe(0);
  });
});

describe('findClientByName', () => {
  const clients = [{ name: 'Acme Corp' }, { name: 'Beta Ltd' }];

  it('finds client by exact name (case-insensitive)', () => {
    expect(findClientByName('acme corp', clients)).toEqual({ name: 'Acme Corp' });
  });
  it('returns null when client is not found', () => {
    expect(findClientByName('Unknown', clients)).toBeNull();
  });
  it('returns null for null name', () => {
    expect(findClientByName(null, clients)).toBeNull();
  });
  it('returns null for empty string name', () => {
    expect(findClientByName('', clients)).toBeNull();
  });
});
