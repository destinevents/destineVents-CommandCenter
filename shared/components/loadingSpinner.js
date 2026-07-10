function renderLoadingSpinner(containerId, text) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `<div class="page-loading">
    <div class="spinner"></div>
    <div class="loading-text">${text || 'Loading\u2026'}</div>
  </div>`;
}

function loadingSpinnerHTML(text) {
  return `<div class="page-loading">
    <div class="spinner"></div>
    <div class="loading-text">${text || 'Loading\u2026'}</div>
  </div>`;
}
