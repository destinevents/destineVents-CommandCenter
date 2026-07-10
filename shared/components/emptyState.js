// FROZEN classic copy — still loaded by index.html (HQ portal). The canonical
// module version lives beside this file (.ts); delete this one when HQ converts.
function renderEmptyState(containerId, icon, message) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `<div class="empty-state">
    ${icon ? `<div class="empty-state-icon">${icon}</div>` : ''}
    ${message || 'No data found.'}
  </div>`;
}

function emptyStateHTML(icon, message) {
  return `<div class="empty-state">
    ${icon ? `<div class="empty-icon">${icon}</div>` : ''}
    ${message || 'No data found.'}
  </div>`;
}
