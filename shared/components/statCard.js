const _statCardTimers = {};

function countUp(el, target, duration) {
  const num = parseFloat(target);
  if (isNaN(num) || num === 0) return;
  const suffix = String(target).replace(/[\d.]/g, '');
  const start = performance.now();
  el.setAttribute('data-counting', '1');
  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(num * ease) + suffix;
    if (t < 1) requestAnimationFrame(step);
    else { el.textContent = target; el.removeAttribute('data-counting'); }
  }
  requestAnimationFrame(step);
}

function renderStatCards(containerId, cards) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = cards.map((c, i) => {
    const accent = c.color ? `<div class="stat-accent" style="background:${c.color}"></div>` : '';
    const iconEl = c.icon ? `<span class="sc-icon">${c.icon}</span>` : '';
    const subEl = c.sub ? `<span class="sc-sub">${c.sub}</span>` : '';
    const changeEl = c.change ? `<div class="stat-change${c.trend === 'up' ? ' up' : ''}">${c.change}</div>` : '';
    const topEl = (iconEl || subEl) ? `<div class="sc-top">${iconEl}${subEl}</div>` : '';

    return `<div class="stat-card stagger-item" style="--i:${i}">
      ${accent}
      ${topEl}
      <div class="stat-value${c.valClass ? ' ' + c.valClass : ''} sc-val"${c.valColor ? ` style="color:${c.valColor}"` : ''} data-target="${String(c.value).replace(/"/g, '&quot;')}">${c.value}</div>
      <div class="stat-label">${c.label}</div>
      ${changeEl}
    </div>`;
  }).join('');

  clearTimeout(_statCardTimers[containerId]);
  _statCardTimers[containerId] = setTimeout(() => {
    container.querySelectorAll('.sc-val[data-target]').forEach(el => {
      countUp(el, el.dataset.target, 700);
    });
  }, 200);
}
