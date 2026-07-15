import type { PayrollRun } from '@shared/types.ts';
import { escapeHtml, statusClass } from '@shared/utils/helpers.ts';
import { formatCurrency } from '@shared/utils/formatUtils.ts';

const EMPLOYEE_TYPES = ['Employee', 'Freelancer', 'Intern', 'Contractor'] as const;
const PAYROLL_STATUSES = ['Draft', 'Pending', 'Paid'] as const;

export { EMPLOYEE_TYPES, PAYROLL_STATUSES };

export function payrollTableHTML(runs: PayrollRun[]): string {
  return runs.map(r => {
    const empLabel = r.employee_name
      ? `<div style="font-weight:500;color:var(--ink)">${escapeHtml(r.employee_name)}</div><div style="font-size:10.5px;color:var(--ink-3)">${escapeHtml(r.employee_type ?? 'Employee')}</div>`
      : `<div style="font-size:11px;color:var(--ink-3)">${r.employees} employee${r.employees !== 1 ? 's' : ''}</div>`;
    const payrollNum = r.payroll_number
      ? `<div style="font-size:10px;color:var(--ink-3);font-family:monospace">${escapeHtml(r.payroll_number)}</div>`
      : '';
    const isPaid = r.status === 'Paid';
    return `
      <tr>
        <td>
          <div style="font-weight:500;color:var(--ink)">${escapeHtml(r.period)}</div>
          ${payrollNum}
        </td>
        <td>${empLabel}</td>
        <td style="font-size:11.5px;color:var(--ink-2)">
          ${r.basic_pay ? formatCurrency(r.basic_pay) : '—'}
          ${r.overtime ? `<div style="font-size:10px;color:var(--ink-3)">+ ${formatCurrency(r.overtime)} OT</div>` : ''}
          ${r.allowances ? `<div style="font-size:10px;color:var(--ink-3)">+ ${formatCurrency(r.allowances)} allow.</div>` : ''}
        </td>
        <td style="font-size:12px;color:var(--ink-3)">${formatCurrency(r.deductions)}</td>
        <td class="amount-cell">${formatCurrency(r.net)}</td>
        <td><span class="badge badge-${statusClass(r.status)}">${escapeHtml(r.status)}</span></td>
        <td>
          <div class="action-menu">
            <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px"
              aria-haspopup="true" aria-expanded="false"
              onclick="toggleActionMenu(this)">Actions ▾</button>
            <div class="action-menu-dropdown" role="menu">
              <button role="menuitem" onclick="printPayslip(${r.id})">Generate Payslip</button>
              <button role="menuitem" onclick="sendPayrollEmail(${r.id})">Email Payslip</button>
              ${!isPaid ? `<button role="menuitem" onclick="markPayrollPaid(${r.id})" style="color:var(--green)">Mark as Paid</button>` : ''}
              <button role="menuitem" onclick="openEditPayroll(${r.id})">Edit</button>
              <button role="menuitem" onclick="handleDeletePayroll(${r.id})" style="color:var(--red)">Delete</button>
            </div>
          </div>
        </td>
      </tr>`;
  }).join('');
}

export function payrollFormHTML(r: Partial<PayrollRun> = {}): string {
  const typeOpts = EMPLOYEE_TYPES.map(t =>
    `<option${r.employee_type === t ? ' selected' : ''}>${t}</option>`
  ).join('');
  const statusOpts = PAYROLL_STATUSES.map(s =>
    `<option${(r.status ?? 'Pending') === s ? ' selected' : ''}>${s}</option>`
  ).join('');

  return `
  <div class="form-grid">
    <div class="form-group">
      <div class="form-label">Employee Name *</div>
      <input class="form-input" id="pp-employee" value="${escapeHtml(r.employee_name || '')}" placeholder="Full name"/>
    </div>
    <div class="form-group">
      <div class="form-label">Employee Type</div>
      <select class="form-input" id="pp-type">
        ${typeOpts}
      </select>
    </div>
    <div class="form-group">
      <div class="form-label">Pay Period *</div>
      <input class="form-input" id="pp-period" value="${escapeHtml(r.period || '')}" placeholder="e.g. Jul 1–15, 2026"/>
    </div>
    <div class="form-group">
      <div class="form-label">Hours Worked</div>
      <input class="form-input" id="pp-hours" type="number" value="${r.hours_worked ?? ''}" placeholder="e.g. 80" oninput="recalcPayroll()"/>
    </div>
    <div class="form-group">
      <div class="form-label">Basic Pay (₱) *</div>
      <input class="form-input" id="pp-basic" type="number" value="${r.basic_pay || 0}" oninput="recalcPayroll()"/>
    </div>
    <div class="form-group">
      <div class="form-label">Overtime (₱)</div>
      <input class="form-input" id="pp-overtime" type="number" value="${r.overtime || 0}" oninput="recalcPayroll()"/>
    </div>
    <div class="form-group">
      <div class="form-label">Allowances (₱)</div>
      <input class="form-input" id="pp-allowances" type="number" value="${r.allowances || 0}" oninput="recalcPayroll()"/>
    </div>
    <div class="form-group">
      <div class="form-label">Deductions (₱)</div>
      <input class="form-input" id="pp-ded" type="number" value="${r.deductions || 0}" oninput="recalcPayroll()"/>
    </div>
    <div class="form-group">
      <div class="form-label">Status</div>
      <select class="form-input" id="pp-status">
        ${statusOpts}
      </select>
    </div>
    <div class="form-group">
      <div class="form-label">Notes</div>
      <input class="form-input" id="pp-notes" value="${escapeHtml(r.notes || '')}" placeholder="Optional"/>
    </div>
  </div>

  <div style="background:var(--linen-2);border:1px solid var(--ink-4);border-radius:6px;padding:12px 16px;margin-top:4px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <span style="font-size:11px;color:var(--ink-3)">Gross Pay (Basic + OT + Allowances)</span>
      <strong id="pp-gross-display" style="font-family:'Cormorant Garamond',serif;font-size:15px">${formatCurrency((r.basic_pay||0)+(r.overtime||0)+(r.allowances||0))}</strong>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <span style="font-size:11px;color:var(--ink-3)">Deductions</span>
      <span id="pp-ded-display" style="font-size:13px;color:var(--red)">− ${formatCurrency(r.deductions||0)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--ink-4);padding-top:8px;margin-top:2px">
      <span style="font-size:12px;font-weight:700;color:var(--ink)">Net Pay</span>
      <strong id="pp-net-display" style="font-family:'Cormorant Garamond',serif;font-size:18px;color:var(--green)">${formatCurrency((r.basic_pay||0)+(r.overtime||0)+(r.allowances||0)-(r.deductions||0))}</strong>
    </div>
  </div>
  <div style="font-size:10px;color:var(--ink-3);margin-top:6px">
    Suggested deductions: SSS ≈ 4.5% · PhilHealth ≈ 2.5% · Pag-IBIG ≈ 2% · Total ≈ 9% of basic pay
    <button type="button" class="btn btn-ghost" style="padding:2px 8px;font-size:10px;margin-left:8px" onclick="autoFillDeductions()">Auto-fill deductions</button>
  </div>`;
}
