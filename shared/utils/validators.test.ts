import { describe, it, expect } from 'vitest';
import {
  validateRequired, validateEmail, validatePassword, validateNumber,
  validateDate, validateForm, validateTaskStatusTransition, validateDailyHours,
} from './validators.ts';

describe('validateRequired', () => {
  it('returns null for a valid string', () =>
    expect(validateRequired('hello', 'Field')).toBeNull());
  it('returns error for empty string', () =>
    expect(validateRequired('', 'Name')).toBe('Name is required.'));
  it('returns error for null', () =>
    expect(validateRequired(null, 'Name')).toBe('Name is required.'));
  it('returns error for whitespace only', () =>
    expect(validateRequired('   ', 'Name')).toBe('Name is required.'));
});

describe('validatePassword', () => {
  it('returns null for a strong password', () => expect(validatePassword('Secure@123')).toBeNull());
  it('returns error for empty string', () => expect(validatePassword('')).toBeTruthy());
  it('returns error when shorter than 8 characters', () =>
    expect(validatePassword('Ab1@xyz')).toBeTruthy());
  it('returns error when missing uppercase', () =>
    expect(validatePassword('secure@123')).toBeTruthy());
  it('returns error when missing lowercase', () =>
    expect(validatePassword('SECURE@123')).toBeTruthy());
  it('returns error when missing number', () =>
    expect(validatePassword('Secure@abc')).toBeTruthy());
  it('returns error when missing special character', () =>
    expect(validatePassword('Secure123')).toBeTruthy());
});

describe('validateEmail', () => {
  it('returns null for valid email', () => expect(validateEmail('a@b.com')).toBeNull());
  it('returns error for missing @', () => expect(validateEmail('notanemail')).toBeTruthy());
  it('returns error for empty string', () => expect(validateEmail('')).toBeTruthy());
});

describe('validateNumber', () => {
  it('returns null for valid number in range', () =>
    expect(validateNumber('5', 'Hours', 0, 8)).toBeNull());
  it('returns error when below min', () =>
    expect(validateNumber('-1', 'Hours', 0, 8)).toBeTruthy());
  it('returns error when above max', () =>
    expect(validateNumber('10', 'Hours', 0, 8)).toBeTruthy());
  it('returns error for non-number', () => expect(validateNumber('abc', 'Hours')).toBeTruthy());
});

describe('validateDate', () => {
  it('returns null for valid date', () => expect(validateDate('2025-06-01', 'Date')).toBeNull());
  it('returns error for invalid date string', () =>
    expect(validateDate('not-a-date', 'Date')).toBeTruthy());
  it('returns error for empty string', () => expect(validateDate('', 'Date')).toBeTruthy());
});

describe('validateForm', () => {
  it('returns null when all fields pass', () => {
    const result = validateForm([
      ['hello', 'Name'],
      ['a@b.com', 'Email', validateEmail],
    ]);
    expect(result).toBeNull();
  });
  it('returns first error when a required field is empty', () => {
    const result = validateForm([['', 'Name']]);
    expect(result).toBe('Name is required.');
  });
});

describe('validateTaskStatusTransition', () => {
  it('allows assigned → acknowledged', () =>
    expect(validateTaskStatusTransition('assigned', 'acknowledged')).toBe(true));
  it('disallows assigned → completed', () =>
    expect(validateTaskStatusTransition('assigned', 'completed')).toBe(false));
  it('disallows reviewed → any', () =>
    expect(validateTaskStatusTransition('reviewed', 'assigned')).toBe(false));
});

describe('validateDailyHours', () => {
  it('returns null when total is within limit', () =>
    expect(validateDailyHours(4, 3, 8)).toBeNull());
  it('returns error when total exceeds limit', () =>
    expect(validateDailyHours(6, 4, 8)).toBeTruthy());
  it('defaults max to 9 when not provided', () => {
    expect(validateDailyHours(7, 2)).toBeNull();
    expect(validateDailyHours(8, 2)).toBeTruthy();
  });
});

describe('validateRequired — additional edge cases', () => {
  it('returns error for undefined', () =>
    expect(validateRequired(undefined, 'Field')).toBeTruthy());
  it('returns null for a single non-space character', () =>
    expect(validateRequired('a', 'Field')).toBeNull());
});

describe('validatePassword — boundary cases', () => {
  it('returns null for exactly 8 characters (minimum boundary)', () =>
    expect(validatePassword('Abcd@123')).toBeNull());
  it('returns error for whitespace-only string (8 spaces)', () =>
    expect(validatePassword('        ')).toBeTruthy());
});

describe('validateForm — multi-error case', () => {
  it('joins all errors when multiple fields fail', () => {
    const result = validateForm([
      ['', 'Name'],
      ['', 'Email'],
    ]);
    expect(result).toContain('Name is required.');
    expect(result).toContain('Email is required.');
  });
});
