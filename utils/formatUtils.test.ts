import { describe, it, expect } from 'vitest';
import { formatCurrency, formatBytes, formatPercentage, capitalize, pluralize } from './formatUtils.ts';

describe('formatCurrency', () => {
  it('formats a positive number with peso sign', () => {
    expect(formatCurrency(1000)).toContain('₱');
  });
  it('treats null as zero', () => {
    const result = formatCurrency(null);
    expect(result).toContain('₱');
    expect(result).toContain('0');
  });
  it('treats a non-numeric string as zero', () => {
    expect(formatCurrency('abc')).toContain('0');
  });
  it('handles zero correctly', () => {
    expect(formatCurrency(0)).toContain('0');
  });
});

describe('formatBytes', () => {
  it('returns bytes for values under 1 KB', () => {
    expect(formatBytes(500)).toBe('500 B');
  });
  it('returns KB for values between 1 KB and 1 MB', () => {
    expect(formatBytes(2048)).toBe('2 KB');
  });
  it('returns MB with one decimal for larger values', () => {
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });
});

describe('formatPercentage', () => {
  it('calculates correct percentage', () => {
    expect(formatPercentage(1, 4)).toBe('25%');
  });
  it('returns 0% when total is zero (avoids divide-by-zero)', () => {
    expect(formatPercentage(5, 0)).toBe('0%');
  });
  it('rounds to nearest integer', () => {
    expect(formatPercentage(1, 3)).toBe('33%');
  });
});

describe('capitalize', () => {
  it('capitalizes the first letter', () => {
    expect(capitalize('hello')).toBe('Hello');
  });
  it('returns empty string for empty input', () => {
    expect(capitalize('')).toBe('');
  });
  it('does not change an already-capitalized string', () => {
    expect(capitalize('Hello')).toBe('Hello');
  });
});

describe('pluralize', () => {
  it('returns singular form when count is 1', () => {
    expect(pluralize(1, 'task')).toBe('task');
  });
  it('appends s when count is 0', () => {
    expect(pluralize(0, 'task')).toBe('tasks');
  });
  it('appends s when count is greater than 1', () => {
    expect(pluralize(5, 'task')).toBe('tasks');
  });
  it('uses provided plural form instead of appending s', () => {
    expect(pluralize(2, 'person', 'people')).toBe('people');
  });
});
