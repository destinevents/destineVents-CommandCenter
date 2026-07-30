// Shared presentation helpers for Monthly Summary (§5) and Reports (§7).
// Pure string builders — no state, no Supabase.
import type { Project } from '@shared/types.ts';
import { escapeHtml } from '@shared/utils/helpers.ts';
import { formatCurrency } from '@shared/utils/formatUtils.ts';
import type { CategoryTotal } from '../reportsCalc.ts';

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const monthLabel = (m: number | null): string =>
  m == null ? 'Whole Year' : (MONTH_NAMES[m - 1] ?? String(m));

// A single KPI figure card.
export function summaryCard(label: string, value: number, opts: { color?: string; sub?: string } = {}): string {
  const color = opts.color ? `;color:${opts.color}` : '';
  const sub = opts.sub ? `<div class="stat-change">${escapeHtml(opts.sub)}</div>` : '';
  return `<div class="stat-card">
    <div class="stat-label">${escapeHtml(label)}</div>
    <div class="stat-value" style="font-size:22px${color}">${formatCurrency(value)}</div>
    ${sub}
  </div>`;
}

// Year / month / project filter toolbar. Handler name is caller-supplied so
// Monthly Summary and Reports can each own their own filter state.
export function periodFilterHTML(opts: {
  years: number[];
  year: number | null;
  month: number | null;
  projectId: number | null;
  projects: Project[];
  onChange: string;         // JS function name, e.g. 'setMonthlySummaryFilter'
  showProject?: boolean;
  extra?: string;           // extra controls (e.g. report-type / export buttons)
}): string {
  const yearOpts = `<option value=""${opts.year == null ? ' selected' : ''}>All Years</option>` +
    opts.years.map(y => `<option value="${y}"${opts.year === y ? ' selected' : ''}>${y}</option>`).join('');
  const monthOpts = `<option value=""${opts.month == null ? ' selected' : ''}>Whole Year</option>` +
    MONTH_NAMES.map((m, i) => `<option value="${i + 1}"${opts.month === i + 1 ? ' selected' : ''}>${m}</option>`).join('');
  const projSelect = opts.showProject === false ? '' : `
    <select class="form-input" id="rep-project" onchange="${opts.onChange}()" style="width:180px">
      <option value=""${opts.projectId == null ? ' selected' : ''}>All Projects</option>
      ${opts.projects.map(p => `<option value="${p.id}"${opts.projectId === p.id ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
    </select>`;
  return `<div class="page-actions" style="margin-bottom:16px;flex-wrap:wrap;gap:8px">
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;flex:1">
      <select class="form-input" id="rep-year" onchange="${opts.onChange}()" style="width:130px">${yearOpts}</select>
      <select class="form-input" id="rep-month" onchange="${opts.onChange}()" style="width:150px">${monthOpts}</select>
      ${projSelect}
    </div>
    ${opts.extra ?? ''}
  </div>`;
}

// A titled table of category → amount, with a total row.
export function categoryTableHTML(title: string, rows: CategoryTotal[], total: number, color = 'var(--ink)'): string {
  const body = rows.length
    ? rows.map(r => `<tr>
        <td style="color:var(--ink-2)">${escapeHtml(r.category)}</td>
        <td class="amount-cell">${formatCurrency(r.amount)}</td>
      </tr>`).join('')
    : `<tr><td colspan="2" style="color:var(--ink-3);font-size:12px;padding:10px">No entries</td></tr>`;
  return `<div class="card" style="padding:16px">
    <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:10px">${escapeHtml(title)}</div>
    <table class="ledger-table" style="margin-top:0">
      <tbody>${body}</tbody>
      <tfoot><tr style="border-top:2px solid var(--ink-4)">
        <td style="font-weight:700;color:${color}">Total ${escapeHtml(title)}</td>
        <td class="amount-cell" style="font-weight:700;color:${color}">${formatCurrency(total)}</td>
      </tr></tfoot>
    </table>
  </div>`;
}

// Horizontal bar chart (inline, no chart library) from category totals.
export function barChartHTML(title: string, rows: CategoryTotal[], color: string): string {
  const max = Math.max(...rows.map(r => r.amount), 1);
  const body = rows.length
    ? rows.slice(0, 8).map(r => `
      <div style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <span style="font-size:11px;color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60%">${escapeHtml(r.category)}</span>
          <span style="font-size:11px;font-weight:600">${formatCurrency(r.amount)}</span>
        </div>
        <div style="height:6px;background:var(--linen-3);border-radius:3px"><div style="height:100%;width:${Math.round(r.amount / max * 100)}%;background:${color};border-radius:3px;opacity:.85"></div></div>
      </div>`).join('')
    : '<div style="font-size:12px;color:var(--ink-3)">No data yet</div>';
  return `<div class="card" style="padding:16px">
    <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:12px">${escapeHtml(title)}</div>
    ${body}
  </div>`;
}

// Vertical grouped bars over months (revenue vs expenses / cash flow trend).
export function monthlyBarsHTML(
  title: string,
  months: { label: string; a: number; b?: number }[],
  legend: { a: string; b?: string },
  colors: { a: string; b?: string },
): string {
  const max = Math.max(...months.flatMap(m => [m.a, m.b ?? 0]), 1);
  const bars = months.map(m => `
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">
      <div style="display:flex;align-items:flex-end;gap:2px;height:64px">
        <div style="width:12px;background:${colors.a};height:${Math.max(2, Math.round(m.a / max * 64))}px;border-radius:2px 2px 0 0"></div>
        ${m.b !== undefined ? `<div style="width:12px;background:${colors.b};height:${Math.max(2, Math.round((m.b || 0) / max * 64))}px;border-radius:2px 2px 0 0"></div>` : ''}
      </div>
      <div style="font-size:9px;color:var(--ink-3)">${escapeHtml(m.label)}</div>
    </div>`).join('');
  const legendHTML = `<div style="display:flex;gap:12px;margin-top:8px">
    <div style="display:flex;align-items:center;gap:4px"><div style="width:8px;height:8px;background:${colors.a};border-radius:2px"></div><span style="font-size:10px;color:var(--ink-3)">${escapeHtml(legend.a)}</span></div>
    ${legend.b ? `<div style="display:flex;align-items:center;gap:4px"><div style="width:8px;height:8px;background:${colors.b};border-radius:2px"></div><span style="font-size:10px;color:var(--ink-3)">${escapeHtml(legend.b)}</span></div>` : ''}
  </div>`;
  return `<div class="card" style="padding:16px">
    <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:12px">${escapeHtml(title)}</div>
    <div style="display:flex;align-items:flex-end;gap:6px;height:80px">${bars}</div>
    ${legendHTML}
  </div>`;
}
