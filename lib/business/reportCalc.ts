export function generateCSV(headers: string[], rows: any[][]): string {
  const esc = (v: any): string => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? '"' + s.replace(/"/g, '""') + '"'
      : s;
  };
  return [headers.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
}

export function generateTimesheetCSV(
  timesheets: any[],
  tasks: any[],
  users: any[]
): { headers: string[]; rows: any[][] } {
  const headers = ['Intern', 'Date', 'Task', 'Activity', 'Hours', 'Category', 'Skills', 'Status'];
  const rows = timesheets.map((ts) => {
    const task = tasks.find((t: any) => t.id === ts.task_id);
    const intern = users.find((u: any) => u.id === ts.intern_id);
    return [
      intern?.name || '—',
      ts.date,
      task?.title || '—',
      ts.activity_description || '',
      ts.hours,
      ts.industry_category || '',
      (ts.skills || []).join('; '),
      ts.status,
    ];
  });
  return { headers, rows };
}
