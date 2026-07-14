// ESM version of shared/utils/helpers.js (frozen classic copy kept for the HQ
// portal until it converts). Keep the two in sync until then.
import { STATUS_LABELS, OUTPUT_TYPES } from '../constants.ts';

export function escapeHtml(str: unknown): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function badge(val: string): string {
  return `<span class="badge badge-${val}">${STATUS_LABELS[val] || val}</span>`;
}

export function pBadge(val: string): string {
  return `<span class="badge badge-${val}">${val.charAt(0).toUpperCase() + val.slice(1)}</span>`;
}

export function avatarEl(initials: string, size = 32, color = "#252f27"): string {
  return `<div class="avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.34)}px;background:${color}">${initials}</div>`;
}

export function debounce<T extends (...args: never[]) => void>(fn: T, wait = 200) {
  let t: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// Wires a static filter toolbar to a render function: text inputs re-render
// debounced as the user types; selects and date inputs re-render on change.
export function attachFilterToolbar(ids: string[], renderFn: () => void): void {
  const debounced = debounce(() => renderFn(), 200);
  ids.forEach(id => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el) return;
    const isTextInput = el.tagName === 'INPUT' && el.type === 'text';
    el.addEventListener(isTextInput ? 'input' : 'change', isTextInput ? debounced : () => renderFn());
  });
}

export interface Pager {
  limit: number;
  pageSize: number;
  reset(): void;
  loadMore(): void;
}

// Paged-rendering state for "Load more" lists: render list.slice(0, pager.limit),
// call pager.loadMore() from the button, pager.reset() when filters change.
export function createPager(pageSize: number, rerender: () => void): Pager {
  return {
    limit: pageSize,
    pageSize,
    reset() { this.limit = this.pageSize; },
    loadMore() {
      this.limit += this.pageSize;
      rerender();
    },
  };
}

// Appends the shared OUTPUT_TYPES options after the select's placeholder option
export function populateOutputTypeSelect(id: string): void {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.insertAdjacentHTML(
    'beforeend',
    Object.entries(OUTPUT_TYPES).map(([v, label]) => `<option value="${v}">${label}</option>`).join('')
  );
}

export function skillPill(s: string): string { return `<span class="skill-pill">${s}</span>`; }

export function skillPillGreen(s: string): string { return `<span class="skill-pill-green">${s}</span>`; }

export function statusClass(s = ''): string {
  return ({
    'Active':'active','Completed':'completed','NDA Signed':'nda','Lead':'lead','Proposal':'proposal',
    'Paid':'paid','Unpaid':'unpaid','Overdue':'overdue',
    'Draft':'draft','Issued':'issued','Cancelled':'cancelled',
    'For Approval':'for-approval','Approved':'approved',
    'Won':'won','Lost':'lost','Sent':'sent','Expired':'expired',
    'Released':'released','Pending':'pending',
    'Proposal Approved':'active',
    'Statement of Billing':'proposal',
    'Invoice':'sent',
    'Payment':'pending',
    'Official Receipt':'released',
  } as Record<string, string>)[s] || 'lead';
}

export function docTypeIcon(t: string): string {
  return ({'NDA':'📋','Contract':'📄','Proposal':'📝','Agreement':'🤝','Document':'📁'} as Record<string, string>)[t] || '📁';
}

export function guessDocType(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('nda'))                            return 'NDA';
  if (n.includes('contract'))                       return 'Contract';
  if (n.includes('proposal'))                       return 'Proposal';
  if (n.includes('agreement') || n.includes('mou')) return 'Agreement';
  return 'Document';
}
