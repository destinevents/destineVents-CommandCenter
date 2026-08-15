// Which tables each page's figures are built from.
//
// This drives two things that must never disagree: what gets loaded before a
// page renders, and which pages a realtime change has to redraw. Stating it
// once means a page cannot end up refreshing its data on entry but then
// sitting on stale numbers while someone else changes them — which is what
// happened to Interns and Reports, whose cards count tasks and timesheet
// entries but only ever redrew on an intern_users change.
export type DataTable = 'users' | 'tasks' | 'timesheets';

export const PAGE_DATA: Readonly<Record<string, readonly DataTable[]>> = {
  dashboard:  ['tasks', 'timesheets'],
  tasks:      ['tasks'],
  timesheets: ['timesheets'],
  outputs:    ['tasks'],
  approvals:  ['timesheets'],
  interns:    ['users', 'tasks', 'timesheets'],
  reports:    ['users', 'tasks', 'timesheets'],
  audit:      ['users'],
  account:    [],
  calendar:   ['timesheets', 'tasks'],
};

export function pageNeeds(page: string, table: DataTable): boolean {
  return (PAGE_DATA[page] ?? []).includes(table);
}
