import { describe, it, expect } from 'vitest';
import type { Client, Project } from '@shared/types.ts';
import { getClientTotalValue, findClientByName, computeClientValue } from './clientService.ts';

describe('getClientTotalValue', () => {
  it('sums total_value from all clients', () => {
    expect(getClientTotalValue([{ total_value: 100 }, { total_value: 200 }] as unknown as Client[])).toBe(300);
  });
  it('treats missing total_value as zero', () => {
    expect(getClientTotalValue([{ name: 'ACME' }] as unknown as Client[])).toBe(0);
  });
  it('returns 0 for empty array', () => {
    expect(getClientTotalValue([])).toBe(0);
  });
});

describe('computeClientValue', () => {
  const projects = [
    { client: 'Acme Corp', value: 100 },
    { client: 'Acme Corp', value: 250 },
    { client: 'Beta Ltd',  value: 500 },
    { client: 'Acme Corp', value: null },
    { client: null,        value: 999 },
  ] as unknown as Project[];

  it('sums the value of all projects linked to the client (case-insensitive)', () => {
    expect(computeClientValue('acme corp', projects)).toBe(350);
  });
  it('treats a missing project value as zero', () => {
    expect(computeClientValue('Beta Ltd', projects)).toBe(500);
  });
  it('returns 0 when the client has no linked projects', () => {
    expect(computeClientValue('Gamma Inc', projects)).toBe(0);
  });
  it('returns 0 for a null/empty client name', () => {
    expect(computeClientValue(null, projects)).toBe(0);
    expect(computeClientValue('', projects)).toBe(0);
  });
  it('returns 0 when there are no projects', () => {
    expect(computeClientValue('Acme Corp', [])).toBe(0);
  });
});

describe('findClientByName', () => {
  const clients = [{ name: 'Acme Corp' }, { name: 'Beta Ltd' }] as unknown as Client[];

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
