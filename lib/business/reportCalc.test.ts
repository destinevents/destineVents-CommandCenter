import { describe, it, expect } from 'vitest';
import { generateCSV, generateTimesheetCSV } from './reportCalc.ts';

describe('generateCSV', () => {
  it('produces a header row and data rows joined by newlines', () => {
    const csv = generateCSV(
      ['Name', 'Age'],
      [
        ['Alice', 30],
        ['Bob', 25],
      ]
    );
    expect(csv).toBe('Name,Age\nAlice,30\nBob,25');
  });

  it('wraps values containing commas in double quotes', () => {
    const csv = generateCSV(['Val'], [['hello, world']]);
    expect(csv).toContain('"hello, world"');
  });

  it('escapes double quotes inside values', () => {
    const csv = generateCSV(['Val'], [['"quoted"']]);
    expect(csv).toContain('""quoted""');
  });

  it('converts null and undefined to empty string', () => {
    const csv = generateCSV(['A', 'B'], [[null, undefined]]);
    expect(csv).toBe('A,B\n,');
  });
});

describe('generateTimesheetCSV', () => {
  const timesheets = [
    {
      id: 'ts1',
      intern_id: 'u1',
      task_id: 't1',
      date: '2026-07-01',
      activity_description: 'Built feature',
      hours: 4,
      industry_category: 'Tech',
      skills: ['JS', 'React'],
      status: 'approved',
    },
  ];
  const tasks = [{ id: 't1', title: 'Feature X' }];
  const users = [{ id: 'u1', name: 'Alice Santos' }];

  it('returns the correct 8-column header row', () => {
    const { headers } = generateTimesheetCSV(timesheets, tasks, users);
    expect(headers).toEqual([
      'Intern',
      'Date',
      'Task',
      'Activity',
      'Hours',
      'Category',
      'Skills',
      'Status',
    ]);
  });

  it('resolves intern name from users array', () => {
    const { rows } = generateTimesheetCSV(timesheets, tasks, users);
    expect(rows[0][0]).toBe('Alice Santos');
  });

  it('resolves task title from tasks array', () => {
    const { rows } = generateTimesheetCSV(timesheets, tasks, users);
    expect(rows[0][2]).toBe('Feature X');
  });

  it('joins skills array with semicolons', () => {
    const { rows } = generateTimesheetCSV(timesheets, tasks, users);
    expect(rows[0][6]).toBe('JS; React');
  });

  it('uses em dash for a missing task reference', () => {
    const { rows } = generateTimesheetCSV([{ ...timesheets[0], task_id: 'missing' }], [], users);
    expect(rows[0][2]).toBe('—');
  });

  it('uses em dash for a missing intern reference', () => {
    const { rows } = generateTimesheetCSV([{ ...timesheets[0], intern_id: 'missing' }], tasks, []);
    expect(rows[0][0]).toBe('—');
  });
});
