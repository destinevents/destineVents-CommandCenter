// FROZEN classic copy — still loaded by index.html (HQ portal). The canonical
// module version lives beside this file (.ts); delete this one when HQ converts.
function formatDate(isoVal, locale, options) {
  if (!isoVal) return '\u2014';
  return new Date(isoVal + 'T12:00:00').toLocaleDateString(locale || 'en-US', options || {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatDateLong(isoVal) {
  return formatDate(isoVal, 'en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function formatDateShort(isoVal) {
  return formatDate(isoVal, 'en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatDateForNDA(isoVal) {
  return formatDate(isoVal, 'en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

function formatTime(isoVal) {
  if (!isoVal) return '\u2014';
  return new Date(isoVal).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
  });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nowISO() {
  return new Date().toISOString();
}

function getCurrentPeriod() {
  const d = new Date();
  const month = d.toLocaleString('en-US', { month: 'long' });
  return `${month} ${d.getFullYear()}`;
}

function getQuarter(date) {
  const m = (date || new Date()).getMonth();
  return 'Q' + (Math.floor(m / 3) + 1) + ' ' + (date || new Date()).getFullYear();
}

// Node/Vitest export — tests run against this shipped file. No-op in browser.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatDate, formatDateLong, formatDateShort, formatDateForNDA,
    formatTime, todayISO, nowISO, getCurrentPeriod, getQuarter,
  };
}
