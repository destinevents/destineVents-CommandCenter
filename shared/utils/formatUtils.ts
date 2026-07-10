export function formatCurrency(n: any): string {
  const v = +n || 0;
  return '₱' + v.toLocaleString('en-PH');
}

export function formatNumber(n: any): string {
  return (+n || 0).toLocaleString('en-PH');
}

export function formatBytes(b: number): string {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return Math.round(b / 1024) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}

export function formatPercentage(n: number, total: number): string {
  if (!total) return '0%';
  return Math.round((n / total) * 100) + '%';
}

export function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : plural || singular + 's';
}
