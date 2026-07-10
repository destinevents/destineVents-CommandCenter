// TRANSITIONAL copies of two validators from shared/utils/validators.js.
// That file is a classic <script> (loaded by the portals) and cannot export
// ESM symbols, so the module-world auth pages carry these two functions until
// shared/utils converts to TS in a later migration phase — then delete this
// file and import from there. Keep the logic in sync with validators.js.

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
