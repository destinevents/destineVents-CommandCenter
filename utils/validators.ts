import type { TaskStatus } from '../js/shared/types';

type ValidatorFn = (value: string) => string | null;

export function validateRequired(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null) return `${fieldName} is required.`;
  if (typeof value === 'string' && value.trim() === '') return `${fieldName} is required.`;
  return null;
}

export function validateEmail(value: string): string | null {
  if (!value || !value.trim()) return 'Email is required.';
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(value.trim())) return 'Please enter a valid email address.';
  return null;
}

export function validatePassword(value: string): string | null {
  if (!value) return 'Password is required.';
  if (value.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(value)) return 'Password must contain at least one uppercase letter.';
  if (!/[a-z]/.test(value)) return 'Password must contain at least one lowercase letter.';
  if (!/[0-9]/.test(value)) return 'Password must contain at least one number.';
  if (!/[^A-Za-z0-9]/.test(value)) return 'Password must contain at least one special character.';
  return null;
}

export function validateNumber(
  value: string,
  fieldName: string,
  min?: number,
  max?: number
): string | null {
  const n = parseFloat(value);
  if (isNaN(n)) return `${fieldName} must be a number.`;
  if (min !== undefined && n < min) return `${fieldName} must be at least ${min}.`;
  if (max !== undefined && n > max) return `${fieldName} must be at most ${max}.`;
  return null;
}

export function validateDate(value: string, fieldName: string): string | null {
  if (!value) return `${fieldName} is required.`;
  if (isNaN(new Date(value).getTime())) return `${fieldName} is not a valid date.`;
  return null;
}

export function validateForm(fields: [unknown, string, ...ValidatorFn[]][]): string | null {
  const errors: string[] = [];
  for (const [value, fieldName, ...validators] of fields) {
    const err = validateRequired(value, fieldName);
    if (err) {
      errors.push(err);
      continue;
    }
    for (const vFn of validators) {
      const e = vFn(value as string);
      if (e) {
        errors.push(e);
        break;
      }
    }
  }
  return errors.length ? errors.join(' ') : null;
}

export function validateTaskStatusTransition(current: TaskStatus, next: TaskStatus): boolean {
  const allowed: Record<TaskStatus, TaskStatus[]> = {
    assigned: ['acknowledged'],
    acknowledged: ['in_progress'],
    in_progress: ['completed'],
    completed: ['reviewed'],
    reviewed: [],
  };
  return (allowed[current] ?? []).includes(next);
}

export function validateDailyHours(
  existingHours: number,
  newHours: number,
  max = 9
): string | null {
  const total = existingHours + newHours;
  if (total > max)
    return `Cannot log ${newHours}h — total would be ${total}h (max is ${max}h per day).`;
  return null;
}
