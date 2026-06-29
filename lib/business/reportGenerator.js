function generateCSV(headers, rows) {
  const esc = v => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [headers.join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
}

function downloadCSV(filename, csvContent) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function generateTimesheetCSV(timesheets, tasks, users) {
  const headers = ['Intern', 'Date', 'Task', 'Activity', 'Hours', 'Category', 'Skills', 'Status'];
  const rows = timesheets.map(ts => {
    const task = tasks.find(t => t.id === ts.task_id);
    const intern = users.find(u => u.id === ts.intern_id);
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

function generateTimesheetPDFData(timesheets, tasks, users, reportStats) {
  const rows = timesheets.map(ts => {
    const task = tasks.find(t => t.id === ts.task_id);
    const intern = users.find(u => u.id === ts.intern_id);
    return { intern: intern?.name || '—', date: ts.date, task: task?.title || '—', activity: ts.activity_description, hours: ts.hours, status: ts.status };
  });
  return { rows, stats: reportStats };
}

function buildReportHTML(reportData) {
  const { rows, stats } = reportData;
  const totalHours = rows.reduce((s, r) => s + r.hours, 0);
  const bodyRows = rows.map(r => `
    <tr><td>${escHtml(r.intern)}</td><td>${r.date}</td><td>${escHtml(r.task)}</td><td>${escHtml(r.activity || '')}</td><td style="text-align:center">${r.hours}h</td><td>${r.status}</td></tr>
  `).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Internship Report</title>
<style>
  body{font-family:'Georgia',serif;color:#111;padding:40px 48px;line-height:1.7;font-size:12px;max-width:800px;margin:auto}
  h1{text-align:center;font-size:20px;margin-bottom:4px}
  .sub{text-align:center;color:#555;font-size:11px;margin-bottom:24px}
  table{width:100%;border-collapse:collapse;margin-bottom:24px}
  th{background:#252f27;color:#F5ECD7;padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.5px}
  td{padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:11px}
  .meta{display:flex;justify-content:space-between;margin-bottom:20px;font-size:11px}
  .meta-box{border:1px solid #e5e7eb;padding:12px 16px;flex:1;margin:0 6px}
  .sig{margin-top:48px;display:flex;justify-content:space-between}
  .sig-line{border-top:1px solid #111;width:200px;padding-top:4px;font-size:10px;text-align:center}
  @media print{body{padding:0}}
</style></head><body>
<h1>Internship Progress Report</h1>
<div class="sub">${APP_SETTINGS.intern.companyName} &mdash; Generated ${formatDateForNDA(todayISO())}</div>
<div class="meta">
  <div class="meta-box"><strong>${stats.totalInterns}</strong><br>Interns</div>
  <div class="meta-box"><strong>${stats.approvedHours}h</strong><br>Approved Hours</div>
  <div class="meta-box"><strong>${stats.totalHours}h</strong><br>Total Hours Logged</div>
</div>
<table><thead><tr><th>Intern</th><th>Date</th><th>Task</th><th>Activity</th><th>Hours</th><th>Status</th></tr></thead>
<tbody>${bodyRows}</tbody></table>
<div class="sig">
  <div><strong>Prepared by</strong><br><br><div class="sig-line">${APP_SETTINGS.company.founder}</div></div>
  <div><strong>${APP_SETTINGS.intern.companyName}</strong><br><br><div class="sig-line">Authorized Signatory</div></div>
</div>
</body></html>`;
}
