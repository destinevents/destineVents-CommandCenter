import { describe, it, expect } from 'vitest';
import {
  parseActivity,
  activityToHtml,
  activityToText,
  activityPreview,
  isLongActivity,
} from './activityFormat.ts';

// A real report, as an intern types it into the Log Hours box.
const REPORT = `destineVents Command Center (HQ)
* Fixed a bug where quotations could save as zero.
* Added an end-to-end test for the quotation flow.

RE:Bloom
- Built out the Founding Team section.
- Connected the Gate 2 requirements to Drive folders.`;

describe('parseActivity', () => {
  it('returns nothing for empty or missing input', () => {
    expect(parseActivity(null)).toEqual([]);
    expect(parseActivity(undefined)).toEqual([]);
    expect(parseActivity('')).toEqual([]);
    expect(parseActivity('   \n  \n ')).toEqual([]);
  });

  it('keeps a single line of prose as one text block', () => {
    expect(parseActivity('Helped host FAE on Railway.')).toEqual([
      { kind: 'text', text: 'Helped host FAE on Railway.' },
    ]);
  });

  it('reads asterisk, dash and numbered lines as bullets', () => {
    const blocks = parseActivity('* one\n- two\n3. three');
    expect(blocks).toEqual([
      { kind: 'bullet', text: 'one', depth: 0 },
      { kind: 'bullet', text: 'two', depth: 0 },
      { kind: 'bullet', text: 'three', depth: 0 },
    ]);
  });

  it('treats indentation as nesting, capped at two levels', () => {
    const blocks = parseActivity('* top\n  * nested\n      * deep');
    expect(blocks.map((b) => (b.kind === 'bullet' ? b.depth : -1))).toEqual([0, 1, 2]);
  });

  it('promotes a short line that introduces a list into a heading', () => {
    const blocks = parseActivity(REPORT);
    expect(blocks[0]).toEqual({ kind: 'heading', text: 'destineVents Command Center (HQ)' });
    expect(blocks[3]).toEqual({ kind: 'heading', text: 'RE:Bloom' });
  });

  it('promotes a trailing-colon line into a heading and drops the colon', () => {
    expect(parseActivity('Notes:\nNothing blocking today.')[0]).toEqual({
      kind: 'heading',
      text: 'Notes',
    });
  });

  it('reads a markdown heading', () => {
    expect(parseActivity('## Week 3 summary')[0]).toEqual({
      kind: 'heading',
      text: 'Week 3 summary',
    });
  });

  it('leaves a long line as prose even when a bullet follows it', () => {
    const long = 'x'.repeat(80);
    expect(parseActivity(`${long}\n* a bullet`)[0].kind).toBe('text');
  });

  it('merges wrapped prose lines into one paragraph but splits on a blank line', () => {
    const blocks = parseActivity('first line\nsecond line\n\nnew paragraph');
    expect(blocks).toEqual([
      { kind: 'text', text: 'first line\nsecond line' },
      { kind: 'text', text: 'new paragraph' },
    ]);
  });

  it('normalizes Windows line endings', () => {
    expect(parseActivity('* one\r\n* two')).toHaveLength(2);
  });

  it('ignores a bullet marker with no content after it', () => {
    expect(parseActivity('* real item\n*   ')).toEqual([
      { kind: 'bullet', text: 'real item', depth: 0 },
    ]);
  });

  describe('recovering entries stored without line breaks', () => {
    it('splits a flattened report back into heading and bullets', () => {
      const blocks = parseActivity('HQ notes * fixed the bug * added a test * cleaned up');
      expect(blocks[0]).toEqual({ kind: 'heading', text: 'HQ notes' });
      expect(blocks.filter((b) => b.kind === 'bullet')).toHaveLength(3);
    });

    it('splits on dashes only when a new item clearly follows', () => {
      const blocks = parseActivity('HQ - Worked on the ledger - Imported the spreadsheet');
      expect(blocks.filter((b) => b.kind === 'bullet')).toHaveLength(2);
    });

    it('leaves hyphenated prose alone', () => {
      const prose = 'Reviewed the end-to-end tests and the well-known edge cases.';
      expect(parseActivity(prose)).toEqual([{ kind: 'text', text: prose }]);
    });

    it('lifts a section title that got glued to the end of a bullet', () => {
      const blocks = parseActivity(
        'HQ * Fixed the audit trail. RE:Bloom * Built out the Founding Team section.'
      );
      expect(blocks.map((b) => b.kind)).toEqual(['heading', 'bullet', 'heading', 'bullet']);
      expect(blocks[2]).toEqual({ kind: 'heading', text: 'RE:Bloom' });
      expect(blocks[1]).toEqual({ kind: 'bullet', text: 'Fixed the audit trail.', depth: 0 });
    });

    it('leaves a trailing sentence that is not a title inside its bullet', () => {
      const blocks = parseActivity(
        'HQ * Fixed the login bug. Also updated the setup docs * Deployed to staging'
      );
      expect(blocks.filter((b) => b.kind === 'heading')).toHaveLength(1);
      expect(blocks[1].text).toContain('Also updated the setup docs');
    });

    it('needs more than one marker before rewriting a line', () => {
      const prose = 'Deployed the app * finally';
      expect(parseActivity(prose)).toEqual([{ kind: 'text', text: prose }]);
    });
  });
});

describe('activityToHtml', () => {
  it('returns an empty string for empty input', () => {
    expect(activityToHtml('')).toBe('');
  });

  it('wraps a bullet run in a single list', () => {
    const html = activityToHtml('* one\n* two');
    expect(html.match(/<ul/g)).toHaveLength(1);
    expect(html.match(/<li/g)).toHaveLength(2);
    expect(html.endsWith('</ul>')).toBe(true);
  });

  it('closes the list before a following heading and reopens for the next run', () => {
    const html = activityToHtml(REPORT);
    expect(html.match(/<ul/g)).toHaveLength(2);
    expect(html).toContain('</ul><div class="act-heading">RE:Bloom</div>');
  });

  it('escapes HTML in the report', () => {
    const html = activityToHtml('* fixed <script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders **bold** as strong without letting markup through', () => {
    expect(activityToHtml('Shipped **the fix** today')).toContain('<strong>the fix</strong>');
    expect(activityToHtml('Shipped **<b>x</b>** today')).toContain('<strong>&lt;b&gt;x&lt;/b&gt;</strong>');
  });

  it('tags nested bullets with their depth', () => {
    expect(activityToHtml('* top\n  * nested')).toContain('act-item--1');
  });
});

describe('activityToText', () => {
  it('renders bullets with a bullet character and indentation', () => {
    expect(activityToText('* one\n  * nested')).toBe('• one\n  • nested');
  });

  it('keeps headings and paragraphs on their own lines', () => {
    expect(activityToText(REPORT).split('\n')).toHaveLength(6);
  });

  it('returns an empty string for missing input', () => {
    expect(activityToText(null)).toBe('');
  });
});

describe('activityPreview', () => {
  it('flattens the report onto one line', () => {
    expect(activityPreview(REPORT)).not.toContain('\n');
  });

  it('truncates with an ellipsis past the limit', () => {
    const preview = activityPreview('x'.repeat(200), 40);
    expect(preview).toHaveLength(40);
    expect(preview.endsWith('…')).toBe(true);
  });

  it('leaves a short entry untouched', () => {
    expect(activityPreview('Short note.')).toBe('Short note.');
  });
});

describe('isLongActivity', () => {
  it('is false for a one-line entry', () => {
    expect(isLongActivity('Helped host FAE on Railway.')).toBe(false);
  });

  it('is true for a multi-section report', () => {
    expect(isLongActivity(REPORT)).toBe(true);
  });

  it('is true for a long single paragraph', () => {
    expect(isLongActivity('word '.repeat(100))).toBe(true);
  });
});
