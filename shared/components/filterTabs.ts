// ESM version of shared/components/filterTabs.js (frozen classic copy kept for HQ).

export function renderFilterTabs(
  containerId: string,
  filters: string[],
  activeFilter: string,
  action: string,
  dataAttr?: string,
  labelMap?: Record<string, string>
): void {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = filters.map(f => {
    const label = (labelMap && labelMap[f]) || f.charAt(0).toUpperCase() + f.slice(1);
    return `<button class="filter-tab${activeFilter === f ? ' active' : ''}"
      data-action="${action}"
      data-${dataAttr || 'filter'}="${f}">${label}</button>`;
  }).join('');
}
