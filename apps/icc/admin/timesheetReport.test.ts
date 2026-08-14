import { describe, it, expect } from 'vitest';
import { buildTimesheetReportHTML } from './timesheetReport.ts';

const BASE = {
  intern: { name: 'Jhon Gabriel Carlos', program: 'BS IT', school: 'University of the Cordilleras' },
  supervisor: { name: 'Jennifer Castro' },
  reportDate: '8/15/2026',
  topSkills: ['Web Development', 'Debugging'],
  taskTitleFor: (ts: { _task?: string }) => ts._task,
  sheets: [
    {
      date: '2026-08-14',
      hours: 8,
      industry_category: 'Technology',
      _task: 'HQ – Finance Controls',
      activity_description: 'HQ\n* Fixed the quotation bug.\n* Added an audit trail.',
    },
    {
      date: '2026-08-13',
      hours: 7,
      industry_category: 'Technology',
      _task: null,
      activity_description: 'Helped host FAE on Railway.',
    },
  ],
};

describe('buildTimesheetReportHTML', () => {
  const html = buildTimesheetReportHTML(BASE);

  it('totals only the entries it was given', () => {
    expect(html).toContain('<div class="v">15h</div>');
    expect(html).toContain('<div class="l">Total Approved Hours</div>');
    expect(html).toContain('<div class="v">2</div>');
  });

  it('keeps the report formatted as bullets under its heading', () => {
    expect(html).toContain('<div class="act-heading">HQ</div>');
    expect(html).toContain('<li class="act-item act-item--0">Fixed the quotation bug.</li>');
  });

  it('inlines the print styles, since the print window has no stylesheet', () => {
    expect(html).toContain('.act-heading');
    expect(html).toContain('.act-list');
    expect(html).toContain('page-break-inside:avoid');
  });

  it('falls back to a dash for an entry with no linked task', () => {
    expect(html).toContain('<td>—</td>');
  });

  it('names the intern in the title and both signature lines', () => {
    expect(html).toContain('<title>Internship Timesheet Report — Jhon Gabriel Carlos</title>');
    expect(html).toContain('Jennifer Castro');
  });

  it('escapes an intern name that contains markup', () => {
    const hostile = buildTimesheetReportHTML({
      ...BASE,
      intern: { ...BASE.intern, name: '<img src=x onerror=alert(1)>' },
    });
    expect(hostile).not.toContain('<img src=x');
    expect(hostile).toContain('&lt;img src=x');
  });

  it('renders an empty report without rows', () => {
    const empty = buildTimesheetReportHTML({ ...BASE, sheets: [], topSkills: [] });
    expect(empty).toContain('<div class="v">0h</div>');
    expect(empty).toContain('<tbody></tbody>');
  });
});
