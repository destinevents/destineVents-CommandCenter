// Renders an intern's activity report as formatted, collapsible text.
//
// Long reports used to dump their whole body into the Approvals card, pushing
// the Approve/Reject buttons far down the page. Anything past a few lines is
// clamped behind a "Show more" toggle; short entries render whole, with no
// button at all. The parsing/escaping lives in shared/utils/activityFormat.ts.
import { activityToHtml, isLongActivity } from '@shared/utils/activityFormat.ts';

export interface ActivityTextOptions {
  /** Height of the collapsed state, in lines of text. */
  readonly lines?: number;
  /** Entries shorter than this render in full, without a toggle. */
  readonly maxChars?: number;
  /** Extra class on the wrapper — 'activity-text--card' / '--cell'. */
  readonly className?: string;
}

export function activityText(raw: unknown, options: ActivityTextOptions = {}): string {
  const html = activityToHtml(raw);
  if (!html) return '';

  const { lines = 4, maxChars = 260, className = '' } = options;
  const wrapperClass = className ? `activity-text ${className}` : 'activity-text';

  if (!isLongActivity(raw, maxChars)) {
    return `<div class="${wrapperClass}"><div class="activity-body">${html}</div></div>`;
  }

  return `<div class="${wrapperClass}" data-collapsed="true" style="--act-lines:${lines}">
    <div class="activity-body">${html}</div>
    <button type="button" class="activity-toggle" data-action="toggle-activity" aria-expanded="false">Show more</button>
  </div>`;
}

// Wired to data-action="toggle-activity" in the portal's click delegation.
export function toggleActivityText(trigger: Element): void {
  const wrapper = trigger.closest('.activity-text');
  if (!wrapper) return;
  const collapsed = wrapper.getAttribute('data-collapsed') === 'true';
  wrapper.setAttribute('data-collapsed', collapsed ? 'false' : 'true');
  trigger.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
  trigger.textContent = collapsed ? 'Show less' : 'Show more';
}

// The print/PDF window is its own document and cannot see the app stylesheet,
// so the export inlines these rules. Always expanded — a printed report has no
// "Show more" to click.
export const ACTIVITY_PRINT_CSS = `
  .activity-body { font-size: 11.5px; line-height: 1.5; }
  .activity-body > *:first-child { margin-top: 0; }
  .activity-body > *:last-child { margin-bottom: 0; }
  .act-heading { font-weight: 700; color: #252f27; margin: 8px 0 3px; }
  .act-para { margin: 0 0 5px; white-space: pre-wrap; }
  .act-list { margin: 0 0 5px; padding-left: 16px; }
  .act-item { margin: 0 0 2px; }
  .act-item--1 { margin-left: 12px; list-style: circle; }
  .act-item--2 { margin-left: 24px; list-style: square; }
`;
