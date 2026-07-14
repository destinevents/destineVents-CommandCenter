import type { PayrollRun } from '@shared/types.ts';
import { escapeHtml, statusClass } from '@shared/utils/helpers.ts';
import { formatCurrency } from '@shared/utils/formatUtils.ts';

export function payrollTableHTML(runs: PayrollRun[]): string {
  return runs.length
    ? runs.map(r => `
        <tr>
          <td style="font-weight:500;color:var(--ink)">${escapeHtml(r.period)}</td>
          <td style="font-size:11.5px;color:var(--ink-3)">${r.employees}</td>
          <td class="amount-cell">${formatCurrency(r.gross)}</td>
          <td style="font-size:12px;color:var(--ink-3)">${formatCurrency(r.deductions)}</td>
          <td class="amount-cell">${formatCurrency(r.net)}</td>
          <td><span class="badge badge-${statusClass(r.status)}">${escapeHtml(r.status)}</span></td>
          <td>
            <div class="flex-gap" style="gap:4px">
              <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="openEditPayroll(${r.id})">Edit</button>
              <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--red)" onclick="handleDeletePayroll(${r.id})">Delete</button>
            </div>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="7"><div class="empty-state">No payroll runs yet</div></td></tr>`;
}

export function payrollFormHTML(r: Partial<PayrollRun> = {}): string {
  return `<div class="form-grid">
    <div class="form-group"><div class="form-label">Period</div><input class="form-input" id="pp-period" value="${escapeHtml(r.period || '')}" placeholder="e.g. Jun 2026"/></div>
    <div class="form-group"><div class="form-label">No. of Employees</div><input class="form-input" id="pp-emp" type="number" value="${r.employees || 0}"/></div>
    <div class="form-group"><div class="form-label">Gross Pay (₱)</div><input class="form-input" id="pp-gross" type="number" value="${r.gross || 0}" oninput="estimateDeductions()"/></div>
    <div class="form-group"><div class="form-label">Est. Deductions (₱)</div><input class="form-input" id="pp-ded" type="number" value="${r.deductions || 0}"/></div>
    <div class="form-group"><div class="form-label">Net Pay (₱)</div><input class="form-input" id="pp-net" type="number" value="${r.net || 0}"/></div>
    <div class="form-group"><div class="form-label">Status</div>
      <select class="form-input" id="pp-status">
        <option${r.status === 'Pending' || !r.status ? ' selected' : ''}>Pending</option>
        <option${r.status === 'Released' ? ' selected' : ''}>Released</option>
      </select>
    </div>
  </div>
  <div style="font-size:10px;color:var(--ink-3);margin-top:-8px">SSS ≈ 4.5% · PhilHealth ≈ 2.5% · Pag-IBIG ≈ 2% of gross</div>`;
}
