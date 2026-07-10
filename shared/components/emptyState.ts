// ESM version of shared/components/emptyState.js (frozen classic copy kept for HQ).

export function emptyStateHTML(icon?: string, message?: string): string {
  return `<div class="empty-state">
    ${icon ? `<div class="empty-icon">${icon}</div>` : ''}
    ${message || 'No data found.'}
  </div>`;
}
