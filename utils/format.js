function formatCurrency(n) {
  const v = +(n) || 0;
  return '\u20B1' + v.toLocaleString('en-PH');
}

function formatNumber(n) {
  return (+(n) || 0).toLocaleString('en-PH');
}

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return Math.round(b / 1024) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}

function formatPercentage(n, total) {
  if (!total) return '0%';
  return Math.round((n / total) * 100) + '%';
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function pluralize(count, singular, plural) {
  return count === 1 ? singular : (plural || singular + 's');
}
