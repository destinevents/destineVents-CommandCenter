import { describe, it, expect } from 'vitest';
import { isMissingProjectIdError, filterPartnersByType } from './partnerService.ts';
import type { Partner } from '@shared/types.ts';

describe('isMissingProjectIdError', () => {
  it('matches the PostgREST schema-cache error for project_id', () => {
    expect(isMissingProjectIdError({
      code: 'PGRST204',
      message: "Could not find the 'project_id' column of 'partners' in the schema cache",
    })).toBe(true);
  });

  it('matches the Postgres undefined-column error for project_id', () => {
    expect(isMissingProjectIdError({
      code: '42703',
      message: 'column "project_id" of relation "partners" does not exist',
    })).toBe(true);
  });

  it('matches on message alone when the code is absent', () => {
    expect(isMissingProjectIdError({
      message: "column project_id does not exist",
    })).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isMissingProjectIdError({ code: '23505', message: 'duplicate key value' })).toBe(false);
  });

  it('does not match missing-column errors for other columns', () => {
    expect(isMissingProjectIdError({
      code: 'PGRST204',
      message: "Could not find the 'email' column of 'partners' in the schema cache",
    })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isMissingProjectIdError(null)).toBe(false);
  });
});

describe('filterPartnersByType', () => {
  const partners = [
    { id: 1, type: 'Vendor' },
    { id: 2, type: 'Sponsor' },
    { id: 3, type: 'Vendor' },
  ] as unknown as Partner[];

  it('returns all partners for "all"', () => {
    expect(filterPartnersByType(partners, 'all')).toHaveLength(3);
  });

  it('returns all partners for an empty type', () => {
    expect(filterPartnersByType(partners, '')).toHaveLength(3);
  });

  it('filters by matching type', () => {
    expect(filterPartnersByType(partners, 'Vendor')).toHaveLength(2);
  });
});
