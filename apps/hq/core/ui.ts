// ─── HQ UI PRIMITIVES (leaf: imports shared only) ────────────────────────────
import { showToast } from '@shared/components/toast.ts';

export function toast(msg: string, type?: string): void {
  showToast(msg, type, 3200);
}

let _onSave: (() => void) | null = null;

export function openModal(title: string, bodyHTML: string, onSave: (() => void) | null, saveLabel = 'Save'): void {
  document.getElementById('modal-title')!.textContent = title;
  document.getElementById('modal-body')!.innerHTML = bodyHTML;
  document.getElementById('modal-overlay')!.classList.add('open');
  _onSave = onSave;
  const saveBtn = document.getElementById('modal-save-btn');
  if (saveBtn) {
    saveBtn.textContent = saveLabel;
    setTimeout(() => saveBtn.focus(), 100);
  }
}

export function closeModal(): void {
  document.getElementById('modal-overlay')!.classList.remove('open');
  _onSave = null;
}

export function saveModal(): void {
  if (_onSave) _onSave();
}

// Phone-width off-canvas nav (hamburger in the topbar, backdrop behind)
export function toggleHqNav(open?: boolean): void {
  const sidebar = document.querySelector('.sidebar') as HTMLElement;
  const backdrop = document.getElementById('hq-backdrop')!;
  const next = open ?? !sidebar.classList.contains('mobile-open');
  sidebar.classList.toggle('mobile-open', next);
  backdrop.classList.toggle('show', next);
}
