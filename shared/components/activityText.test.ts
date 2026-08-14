// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { activityText, toggleActivityText } from './activityText.ts';

const LONG = `HQ
* Fixed a bug where quotations could save as zero and made the values stay matched.
* Fixed the receipts so they stop expiring after 90 days.
* Added a small audit trail for budget changes.
* Cleaned up a duplicate project.`;

const SHORT = 'Helped host FAE on Railway.';

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
}

describe('activityText', () => {
  it('returns nothing for an empty entry', () => {
    expect(activityText('')).toBe('');
    expect(activityText(null)).toBe('');
  });

  it('renders a short entry in full, with no toggle', () => {
    const html = activityText(SHORT);
    expect(html).not.toContain('activity-toggle');
    expect(html).not.toContain('data-collapsed');
    expect(html).toContain(SHORT);
  });

  it('collapses a long entry behind a Show more button', () => {
    const html = activityText(LONG);
    expect(html).toContain('data-collapsed="true"');
    expect(html).toContain('>Show more<');
    expect(html).toContain('aria-expanded="false"');
  });

  it('keeps the whole report in the markup, so nothing is lost when expanded', () => {
    expect(activityText(LONG)).toContain('Cleaned up a duplicate project.');
  });

  it('applies the caller\'s clamp height and class', () => {
    const html = activityText(LONG, { lines: 5, className: 'activity-text--card' });
    expect(html).toContain('--act-lines:5');
    expect(html).toContain('class="activity-text activity-text--card"');
  });

  it('collapses a long single paragraph, and stops once maxChars is raised past it', () => {
    const paragraph = 'Reviewed the finance ledger. '.repeat(12);
    expect(activityText(paragraph)).toContain('activity-toggle');
    expect(activityText(paragraph, { maxChars: 5000 })).not.toContain('activity-toggle');
  });

  it('still collapses a multi-section report, however short its sections are', () => {
    expect(activityText(LONG, { maxChars: 5000 })).toContain('activity-toggle');
  });
});

describe('toggleActivityText', () => {
  it('expands, then collapses again, keeping the label and aria in step', () => {
    const wrapper = mount(activityText(LONG));
    const button = wrapper.querySelector('.activity-toggle') as HTMLElement;

    toggleActivityText(button);
    expect(wrapper.getAttribute('data-collapsed')).toBe('false');
    expect(button.textContent).toBe('Show less');
    expect(button.getAttribute('aria-expanded')).toBe('true');

    toggleActivityText(button);
    expect(wrapper.getAttribute('data-collapsed')).toBe('true');
    expect(button.textContent).toBe('Show more');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('ignores a trigger that is not inside an activity block', () => {
    const stray = mount('<button class="activity-toggle">Show more</button>');
    expect(() => toggleActivityText(stray)).not.toThrow();
    expect(stray.textContent).toBe('Show more');
  });
});
