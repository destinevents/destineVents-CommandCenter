// Live Philippine-time clock in the auth-page top bar.
(function () {
  const el = document.getElementById('auth-clock-time');
  if (!el) return;
  const fmt = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  function tick() { el.textContent = fmt.format(new Date()); }
  tick();
  setInterval(tick, 1000);
})();

// Ripple effect on .btn-primary clicks.
(function () {
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('.btn-primary');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const span = document.createElement('span');
    span.className = 'ripple';
    span.style.left = (e.clientX - rect.left) + 'px';
    span.style.top  = (e.clientY - rect.top)  + 'px';
    btn.appendChild(span);
    span.addEventListener('animationend', () => span.remove(), { once: true });
  });
})();
