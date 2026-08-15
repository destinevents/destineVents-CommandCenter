import { describe, it, expect } from 'vitest';
import { PAGE_DATA, pageNeeds } from './pageData.ts';

describe('pageNeeds', () => {
  it('is false for a page that does not read the table', () => {
    expect(pageNeeds('tasks', 'timesheets')).toBe(false);
    expect(pageNeeds('audit', 'tasks')).toBe(false);
  });

  it('is false for a page with no data of its own', () => {
    expect(pageNeeds('account', 'tasks')).toBe(false);
    expect(pageNeeds('account', 'timesheets')).toBe(false);
    expect(pageNeeds('account', 'users')).toBe(false);
  });

  it('is false for an unknown page rather than throwing', () => {
    expect(pageNeeds('nonexistent', 'tasks')).toBe(false);
  });
});

// The Interns and Reports cards count tasks done, entries awaiting review and
// approved hours per person. Both figures come from tables other than
// intern_users, and a realtime change to either one has to redraw the page —
// previously it did not, and the cards showed counts that were no longer true.
describe('pages built from another person\'s tasks and timesheets', () => {
  it.each(['interns', 'reports'])('%s redraws on tasks, timesheets and users', (page) => {
    expect(pageNeeds(page, 'tasks')).toBe(true);
    expect(pageNeeds(page, 'timesheets')).toBe(true);
    expect(pageNeeds(page, 'users')).toBe(true);
  });

  it('keeps the approvals queue tied to timesheets', () => {
    expect(pageNeeds('approvals', 'timesheets')).toBe(true);
  });

  it('keeps the calendar tied to both tables it reads', () => {
    expect(pageNeeds('calendar', 'timesheets')).toBe(true);
    expect(pageNeeds('calendar', 'tasks')).toBe(true);
  });
});

describe('PAGE_DATA', () => {
  it('declares only tables that exist', () => {
    const tables = Object.values(PAGE_DATA).flat();
    expect([...new Set(tables)].sort()).toEqual(['tasks', 'timesheets', 'users']);
  });

  it('lists every table at most once per page', () => {
    Object.entries(PAGE_DATA).forEach(([page, tables]) => {
      expect(new Set(tables).size, `${page} repeats a table`).toBe(tables.length);
    });
  });
});
