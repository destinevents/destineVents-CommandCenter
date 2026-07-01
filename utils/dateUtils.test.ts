import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatDateShort,
  formatDateForNDA,
  todayISO,
  getQuarter,
} from './dateUtils.ts';

describe('formatDate', () => {
  it('returns em dash for null', () => {
    expect(formatDate(null)).toBe('—');
  });
  it('returns em dash for undefined', () => {
    expect(formatDate(undefined)).toBe('—');
  });
  it('returns em dash for empty string', () => {
    expect(formatDate('')).toBe('—');
  });
  it('includes the year for a valid ISO date', () => {
    expect(formatDate('2026-07-01')).toContain('2026');
  });
  it('includes a month abbreviation for a valid ISO date', () => {
    expect(formatDate('2026-07-01')).toContain('Jul');
  });
});

describe('formatDateShort', () => {
  it('includes month abbreviation and year', () => {
    const result = formatDateShort('2026-01-15');
    expect(result).toContain('Jan');
    expect(result).toContain('2026');
  });
  it('returns em dash for null', () => {
    expect(formatDateShort(null)).toBe('—');
  });
});

describe('formatDateForNDA', () => {
  it('includes the full month name', () => {
    expect(formatDateForNDA('2026-07-01')).toContain('July');
  });
});

describe('todayISO', () => {
  it('returns a string in YYYY-MM-DD format', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('getQuarter', () => {
  it('returns Q1 for January', () => {
    expect(getQuarter(new Date('2026-01-15'))).toBe('Q1 2026');
  });
  it('returns Q3 for July', () => {
    expect(getQuarter(new Date('2026-07-01'))).toBe('Q3 2026');
  });
  it('returns Q4 for December', () => {
    expect(getQuarter(new Date('2026-12-01'))).toBe('Q4 2026');
  });
});
