// Shared auth-page chrome: live PH-time clock + button ripple.
// Side-effect module — imported by login.ts / signup.ts / reset.ts.

// Live Philippine-time clock in the auth-page top bar.
(function () {
  const el = document.getElementById('auth-clock-time');
  if (!el) return;
  const fmt = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  function tick() { el!.textContent = fmt.format(new Date()); }
  tick();
  const clockId = setInterval(tick, 1000);
  window.addEventListener('pagehide', () => clearInterval(clockId), { once: true });
})();

// Ripple effect on .btn-primary clicks.
(function () {
  document.addEventListener('click', function (e) {
    const target = e.target as HTMLElement | null;
    const btn = target?.closest('.btn-primary');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const span = document.createElement('span');
    span.className = 'ripple';
    span.style.left = (e.clientX - rect.left) + 'px';
    span.style.top  = (e.clientY - rect.top)  + 'px';
    btn.appendChild(span);
    span.addEventListener('animationend', () => span.remove(), { once: true });
    setTimeout(() => span.remove(), 600);
  });
})();

export {};
