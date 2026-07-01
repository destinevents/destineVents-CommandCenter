export function formatDate(
  isoVal: string | null | undefined,
  locale?: string,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!isoVal) return '—';
  return new Date(isoVal + 'T12:00:00').toLocaleDateString(locale || 'en-US', options || {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function formatDateShort(isoVal: string | null | undefined): string {
  return formatDate(isoVal, 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateForNDA(isoVal: string | null | undefined): string {
  return formatDate(isoVal, 'en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getQuarter(date?: Date): string {
  const d = date || new Date();
  return 'Q' + (Math.floor(d.getMonth() / 3) + 1) + ' ' + d.getFullYear();
}
