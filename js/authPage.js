// Live Philippine-time clock in the auth-page top bar.
(function () {
  const el = document.getElementById('auth-clock-time');
  if (!el) return;
  const fmt = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  function tick() {
    el.textContent = fmt.format(new Date());
  }
  tick();
  setInterval(tick, 1000);
})();
