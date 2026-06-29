function renderStatCards(containerId, cards) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = cards.map(c => {
    const accent = c.color ? `<div class="stat-accent" style="background:${c.color}"></div>` : '';
    const iconEl = c.icon ? `<span class="sc-icon">${c.icon}</span>` : '';
    const subEl = c.sub ? `<span class="sc-sub">${c.sub}</span>` : '';
    const changeEl = c.change ? `<div class="stat-change${c.trend === 'up' ? ' up' : ''}">${c.change}</div>` : '';
    const topEl = (iconEl || subEl) ? `<div class="sc-top">${iconEl}${subEl}</div>` : '';

    return `<div class="stat-card">
      ${accent}
      ${topEl}
      <div class="stat-value${c.valClass ? ' ' + c.valClass : ''}"${c.valColor ? ` style="color:${c.valColor}"` : ''}>${c.value}</div>
      <div class="stat-label">${c.label}</div>
      ${changeEl}
    </div>`;
  }).join('');
}
