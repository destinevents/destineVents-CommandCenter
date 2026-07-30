import { describe, it, expect } from 'vitest';
import { neutralizeCell, rowsToCSV, rowsToExcelHTML } from './exportUtils.ts';

describe('exportUtils — neutralizeCell (formula-injection guard)', () => {
  it('prefixes an apostrophe on formula triggers', () => {
    expect(neutralizeCell('=1+1')).toBe("'=1+1");
    expect(neutralizeCell('+A1')).toBe("'+A1");
    expect(neutralizeCell('-2+3')).toBe("'-2+3");
    expect(neutralizeCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(neutralizeCell('\tx')).toBe("'\tx");
  });

  it('leaves ordinary text untouched', () => {
    expect(neutralizeCell('Client payment')).toBe('Client payment');
    expect(neutralizeCell('a=b')).toBe('a=b'); // trigger only matters at the start
    expect(neutralizeCell('')).toBe('');
  });
});

describe('exportUtils — rowsToCSV', () => {
  it('quotes cells and neutralizes leading formulas on strings only', () => {
    const csv = rowsToCSV([
      ['Date', 'Description', 'Amount'],
      ['2026-07-10', '=cmd|calc', 5000],
      ['2026-07-11', 'Normal note', -250],
    ]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('"Date","Description","Amount"');
    // string formula neutralized, number left numeric (not apostrophe'd)
    expect(lines[1]).toBe('"2026-07-10","\'=cmd|calc","5000"');
    expect(lines[2]).toBe('"2026-07-11","Normal note","-250"');
  });

  it('escapes embedded double quotes', () => {
    expect(rowsToCSV([['He said "hi"']])).toBe('"He said ""hi"""');
  });
});

describe('exportUtils — rowsToExcelHTML', () => {
  it('renders headings, spacers and data rows', () => {
    const html = rowsToExcelHTML('Report', [
      ['PROFIT & LOSS'],   // heading
      [],                  // spacer
      ['Revenue', 12000],  // data
    ]);
    expect(html).toContain('<x:Name>Report</x:Name>');
    expect(html).toContain('PROFIT &amp; L'); // heading escaped
    expect(html).toContain('colspan');         // heading + spacer span all cols
    expect(html).toContain('>12000</td>');     // number kept numeric
    expect(html).toContain('mso-number-format');
  });

  it('escapes and neutralizes string cells to block formula injection', () => {
    const html = rowsToExcelHTML('R', [['2026-07-10', '=HYPERLINK("http://x")']]);
    // Leading apostrophe (HTML-escaped to &#39;) makes Excel treat it as text.
    expect(html).toContain('&#39;=HYPERLINK');
    expect(html).toContain('&quot;');           // quotes escaped, no live markup
    expect(html).not.toContain('<a ');
  });
});
