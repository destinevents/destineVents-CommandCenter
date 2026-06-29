function showToast(msg, type, duration) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast' + (type ? ' ' + type : '');
  void t.offsetWidth;
  t.classList.add('visible');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('visible'), duration || 3200);
}

function hideToast() {
  const t = document.getElementById('toast');
  if (t) t.classList.remove('visible');
}
