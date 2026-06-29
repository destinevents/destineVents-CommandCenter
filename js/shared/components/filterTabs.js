function renderFilterTabs(containerId, filters, activeFilter, action, dataAttr, labelMap) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = filters.map(f => {
    const label = (labelMap && labelMap[f]) || f.charAt(0).toUpperCase() + f.slice(1);
    return `<button class="filter-tab${activeFilter === f ? ' active' : ''}"
      data-action="${action}"
      data-${dataAttr || 'filter'}="${f}">${label}</button>`;
  }).join('');
}
