import { formatCurrency } from '@shared/utils/formatUtils.ts';
import { _ledger, _accounts } from '@hq/core/state.ts';
import { projectionMetrics } from './ledgerCalc.ts';

function pct(value: number | null): string {
  if (value === null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function runway(months: number | null): string {
  if (months === null) return '∞';
  return `${months.toFixed(1)} mo`;
}

function metricCard(label: string, value: string, color = ''): string {
  return `<div class="stat-card">
    <div class="stat-label">${label}</div>
    <div class="stat-value" style="font-size:20px${color ? `;color:${color}` : ''}">${value}</div>
  </div>`;
}

export function renderProjections(): void {
  const container = document.getElementById('ftab-projections');
  if (!container) return;

  const m = projectionMetrics(_ledger, _accounts);
  const burnColor = m.monthlyBurnRate > 0 ? 'var(--red)' : 'var(--green)';
  const profitColor = m.avgNetProfit >= 0 ? 'var(--green)' : 'var(--red)';

  const emptyNote = m.monthsObserved === 0
    ? `<div class="empty-state" style="margin-bottom:16px">No ledger history yet — projections appear once you record cash entries.</div>`
    : '';

  const forecastRows = m.periods.map(p => `<tr>
    <td style="font-weight:500;color:var(--ink)">${p.label}</td>
    <td class="amount-cell" style="color:var(--green)">${formatCurrency(p.projectedRevenue)}</td>
    <td class="amount-cell" style="color:var(--red)">${formatCurrency(p.projectedExpenses)}</td>
    <td class="amount-cell" style="font-weight:600">${formatCurrency(p.projectedCash)}</td>
  </tr>`).join('');

  container.innerHTML = `
    <div style="font-size:11px;color:var(--ink-3);margin-bottom:12px">Auto-generated from Cash Ledger history — read only. Based on ${m.monthsObserved} month${m.monthsObserved === 1 ? '' : 's'} of data.</div>
    ${emptyNote}
    <div class="finance-stat-grid" style="margin-bottom:16px">
      ${metricCard('Current Cash', formatCurrency(m.currentCash), 'var(--green)')}
      ${metricCard('Avg Monthly Revenue', formatCurrency(m.avgMonthlyRevenue))}
      ${metricCard('Avg Monthly Expenses', formatCurrency(m.avgMonthlyExpenses))}
      ${metricCard('Avg Net Profit', formatCurrency(m.avgNetProfit), profitColor)}
      ${metricCard('Monthly Burn Rate', formatCurrency(m.monthlyBurnRate), burnColor)}
      ${metricCard('Cash Runway', runway(m.cashRunwayMonths))}
      ${metricCard('Revenue Growth', pct(m.revenueGrowthPct))}
      ${metricCard('Expense Growth', pct(m.expenseGrowthPct))}
    </div>
    <div class="card-title" style="margin-bottom:8px">Forecast</div>
    <div style="border:1px solid var(--ink-4);overflow-x:auto">
      <table class="ledger-table">
        <thead><tr>
          <th>Period</th><th>Projected Revenue</th><th>Projected Expenses</th><th>Projected Cash Balance</th>
        </tr></thead>
        <tbody>${forecastRows}</tbody>
      </table>
    </div>`;
}
