// Monthly Summary (§5) — READ ONLY. Every figure is auto-calculated from the
// Cash Ledger + Founder Capital; users never encode values here. Filter by
// Year / Month / Project.
import { _ledger, _founderCapital, _projects } from '@hq/core/state.ts';
import { monthlySummary, availableYears, type PeriodFilter } from './reportsCalc.ts';
import { summaryCard, periodFilterHTML, monthLabel } from './templates/reports.ts';

let _msYear: number | null = new Date().getFullYear();
let _msMonth: number | null = null;
let _msProject: number | null = null;

function _filter(): PeriodFilter {
  return { year: _msYear, month: _msMonth, projectId: _msProject };
}

export function renderMonthlySummary(): void {
  const container = document.getElementById('ftab-summary');
  if (!container) return;

  const s = monthlySummary(_ledger, _founderCapital, _filter());
  const scopeLabel = `${_msYear ?? 'All years'}${_msYear ? ` · ${monthLabel(_msMonth)}` : ''}`;

  container.innerHTML =
    periodFilterHTML({
      years: availableYears(_ledger),
      year: _msYear, month: _msMonth, projectId: _msProject,
      projects: _projects, onChange: 'setMonthlySummaryFilter',
    }) + `
    <div style="font-size:11px;color:var(--ink-3);margin:-6px 0 14px">Read-only — all values auto-calculated from the Cash Ledger for <strong>${scopeLabel}</strong>.</div>
    <div class="finance-stat-grid" style="margin-bottom:16px">
      ${summaryCard('Monthly Revenue', s.revenue, { color: 'var(--green)', sub: 'Operating cash in' })}
      ${summaryCard('Monthly Expenses', s.expenses, { color: 'var(--red)', sub: 'Operating cash out' })}
      ${summaryCard('Gross Profit', s.grossProfit, { sub: 'Revenue − cost of services' })}
      ${summaryCard('Net Profit', s.netProfit, { color: s.netProfit >= 0 ? 'var(--green)' : 'var(--red)', sub: 'Revenue − all expenses' })}
    </div>
    <div class="finance-stat-grid" style="margin-bottom:16px">
      ${summaryCard('Cash Flow', s.netCashFlow, { color: s.netCashFlow >= 0 ? 'var(--green)' : 'var(--red)', sub: 'Total in − total out' })}
      ${summaryCard('Collections', s.collections, { sub: 'From clients / receivables' })}
      ${summaryCard('Payments', s.payments, { sub: 'To vendors / payroll' })}
      ${summaryCard('Total Cash In', s.totalCashIn, { color: 'var(--green)' })}
    </div>
    <div class="finance-stat-grid">
      ${summaryCard('Total Cash Out', s.totalCashOut, { color: 'var(--red)' })}
      ${summaryCard('Founder Contributions', s.founderContributions, { sub: 'Capital invested' })}
      ${summaryCard('Founder Withdrawals', s.founderWithdrawals, { sub: 'Owner draws' })}
    </div>`;
}

export function setMonthlySummaryFilter(): void {
  const yearVal = (document.getElementById('rep-year') as HTMLSelectElement | null)?.value ?? '';
  const monthVal = (document.getElementById('rep-month') as HTMLSelectElement | null)?.value ?? '';
  const projVal = (document.getElementById('rep-project') as HTMLSelectElement | null)?.value ?? '';
  _msYear = yearVal ? Number(yearVal) : null;
  _msMonth = monthVal ? Number(monthVal) : null;
  _msProject = projVal ? Number(projVal) : null;
  renderMonthlySummary();
}
