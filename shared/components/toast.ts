// ESM version of shared/components/toast.js (frozen classic copy kept for HQ).

export function showToast(msg: string, type?: string, duration?: number): void {
  const t = document.getElementById('toast') as (HTMLElement & { _t?: ReturnType<typeof setTimeout> }) | null;
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast' + (type ? ' ' + type : '');
  void t.offsetWidth;
  t.classList.add('visible');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('visible'), duration || 3200);
}

export function hideToast(): void {
  const t = document.getElementById('toast');
  if (t) t.classList.remove('visible');
}
