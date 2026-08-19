// Row-level ⋯ menu shared by the HQ tables.
//
// The dismiss listeners attach on first use rather than at page load: they
// used to be wired up inside loadFinance(), so a menu rendered on a page that
// loads on its own — Projects, Meetings — stayed open until Finance had been
// visited at least once.

import { escapeHtml } from '@shared/utils/helpers.ts';

let dismissListenersAttached = false;

function closeOpenMenus(): void {
  document.querySelectorAll('.action-menu-dropdown.open').forEach(el => el.classList.remove('open'));
}

function attachDismissListeners(): void {
  if (dismissListenersAttached) return;
  dismissListenersAttached = true;
  document.addEventListener('click', e => {
    if (!(e.target as HTMLElement).closest('.action-menu')) closeOpenMenus();
  }, { capture: true });
  // The dropdown is positioned fixed against the trigger, so it would drift
  // away from its row on scroll.
  document.addEventListener('scroll', closeOpenMenus, { capture: true, passive: true });
}

export function toggleActionMenu(btn: HTMLElement): void {
  attachDismissListeners();
  const menu = btn.nextElementSibling as HTMLElement | null;
  const wasOpen = menu?.classList.contains('open') ?? false;
  closeOpenMenus();
  if (!menu || wasOpen) return;

  const rect = btn.getBoundingClientRect();
  menu.style.top   = `${rect.bottom + 4}px`;
  menu.style.right = `${window.innerWidth - rect.right}px`;
  menu.classList.add('open');
}

// A trigger plus its dropdown. `items` is the menu's own markup — <button> and
// <a> children, separated with <div class="action-menu-sep">. `label` is plain
// text; it is escaped here.
export function actionMenuHTML(items: string, label = 'Row actions'): string {
  const safeLabel = escapeHtml(label);
  return `
    <div class="action-menu">
      <button class="action-menu-trigger" aria-haspopup="menu" aria-label="${safeLabel}" title="${safeLabel}" onclick="toggleActionMenu(this)">···</button>
      <div class="action-menu-dropdown" role="menu">${items}</div>
    </div>`;
}
