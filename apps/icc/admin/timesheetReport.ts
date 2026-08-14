// @ts-nocheck
// Builds the printable Internship Timesheet Report (the "PDF" export — the
// browser's print dialog turns it into one). Pure: takes the rows it needs and
// returns HTML, so the layout can be rendered and tested without a window.
import { escapeHtml } from '@shared/utils/helpers.ts';
import { activityToHtml } from '@shared/utils/activityFormat.ts';
import { ACTIVITY_PRINT_CSS } from '@shared/components/activityText.ts';

const REPORT_CSS = `
  body{font-family:'DM Sans',sans-serif;padding:40px;color:#1a1a1a;max-width:800px;margin:0 auto}
  h1{color:#252f27;font-size:22px;margin-bottom:4px} .sub{color:#6b7280;font-size:13px}
  .divider{border:none;border-top:2px solid #C9A84C;margin:20px 0}
  .meta-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px}
  .meta-box{background:#f9fafb;border-radius:8px;padding:12px;text-align:center}
  .meta-box .v{font-size:20px;font-weight:800;color:#252f27}
  .meta-box .l{font-size:11px;color:#6b7280;margin-top:2px}
  table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}
  th{background:#252f27;color:#F5ECD7;padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase}
  td{padding:9px 12px;border-bottom:1px solid #f3f4f6;vertical-align:top;word-wrap:break-word}
  tr:nth-child(even) td{background:#fafafa}
  .nowrap{white-space:nowrap}
  /* Keep an entry whole: a report should never break mid-bullet across pages */
  tbody tr{page-break-inside:avoid}
  .sig-section{margin-top:40px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px}
  .sig-box{border-top:2px solid #e5e7eb;padding-top:8px;font-size:11px;color:#6b7280}
  .skills-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
  .sp{background:#eef2ff;color:#6366f1;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:600}
`;

function metaBox(value, label) {
  return `<div class="meta-box"><div class="v">${value}</div><div class="l">${label}</div></div>`;
}

// The Activity column carries the intern's own headings and bullets, so it gets
// the widest share of the page.
function reportRow(sheet, taskTitle) {
  return `<tr>
      <td class="nowrap">${escapeHtml(sheet.date)}</td>
      <td>${escapeHtml(taskTitle) || '—'}</td>
      <td><div class="activity-body">${activityToHtml(sheet.activity_description)}</div></td>
      <td class="nowrap">${sheet.hours}h</td>
      <td>${escapeHtml(sheet.industry_category)}</td>
    </tr>`;
}

export function buildTimesheetReportHTML({ intern, supervisor, sheets, taskTitleFor, topSkills, reportDate }) {
  const totalHours = sheets.reduce((sum, ts) => sum + ts.hours, 0);
  const rows = sheets.map((ts) => reportRow(ts, taskTitleFor(ts))).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Internship Timesheet Report — ${escapeHtml(intern.name)}</title>
  <style>${REPORT_CSS}${ACTIVITY_PRINT_CSS}</style></head><body>
    <h1>Internship Timesheet Report</h1>
    <div class="sub">Disenyo Digitals Collective OPC · Baguio City, Philippines</div>
    <hr class="divider"/>
    <div class="meta-grid">
      ${metaBox(escapeHtml(intern.name), 'Intern Name')}
      ${metaBox(escapeHtml(intern.program), 'Program')}
      ${metaBox(escapeHtml(intern.school), 'School')}
    </div>
    <div class="meta-grid">
      ${metaBox(`${totalHours}h`, 'Total Approved Hours')}
      ${metaBox(sheets.length, 'Approved Entries')}
      ${metaBox(escapeHtml(reportDate), 'Report Date')}
    </div>
    <h3 style="margin:0 0 8px;font-size:14px;color:#252f27">Top Skills Demonstrated</h3>
    <div class="skills-row">${topSkills.map((s) => `<span class="sp">${escapeHtml(s)}</span>`).join('')}</div>
    <hr class="divider"/>
    <table>
      <colgroup><col style="width:11%"/><col style="width:17%"/><col style="width:48%"/><col style="width:9%"/><col style="width:15%"/></colgroup>
      <thead><tr><th>Date</th><th>Task</th><th>Activity</th><th>Hours</th><th>Category</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="sig-section">
      <div class="sig-box"><strong>Intern Signature</strong><br/>${escapeHtml(intern.name)}<br/><br/><br/>___________________</div>
      <div class="sig-box"><strong>Supervisor Signature</strong><br/>${escapeHtml(supervisor.name)}<br/><br/><br/>___________________</div>
      <div class="sig-box"><strong>Company Seal</strong><br/>Disenyo Digitals<br/>Collective OPC<br/><br/>___________________</div>
    </div>
  </body></html>`;
}
