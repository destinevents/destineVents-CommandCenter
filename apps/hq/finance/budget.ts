// Budget Planner (§1) — set a planned budget per expense category for a year
// (or a specific month); "Actual" is computed live from the Cash Ledger and
// compared against the budget with a variance + usage bar.
import { formatCurrency } from '@shared/utils/formatUtils.ts';
import { escapeHtml } from '@shared/utils/helpers.ts';
import { toast, openModal, closeModal } from '@hq/core/ui.ts';
import { _budgets, _ledger } from '@hq/core/state.ts';
import { createBudget, updateBudget, deleteBudget } from './budgetService.ts';
import { logDocActivity } from '@shared/services/documents/activityLogService.ts';
import { getCurrentUser } from '@shared/core/authService.ts';
import {
  budgetVsActual, availableYears, EXPENSE_CATEGORIES, type BudgetLine,
} from './reportsCalc.ts';
import { MONTH_NAMES, summaryCard } from './templates/reports.ts';
import { canManageFinance } from './financePermissions.ts';
import { loadFinance } from './finance.ts';
import type { Budget } from '@shared/types.ts';

const gVal = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? '';

let _budYear: number = new Date().getFullYear();
let _budMonth: number | null = null;
let _editingBudgetId: number | null = null;

function _usageBar(line: BudgetLine): string {
  if (line.usedPct == null) return '<span style="font-size:11px;color:var(--ink-3)">No budget</span>';
  const pct = Math.min(line.usedPct, 100);
  const over = line.usedPct > 100;
  const color = over ? 'var(--red)' : line.usedPct > 85 ? 'var(--gold)' : 'var(--green)';
  return `<div style="display:flex;align-items:center;gap:8px">
    <div style="flex:1;height:6px;background:var(--linen-3);border-radius:3px;min-width:70px"><div style="height:100%;width:${pct}%;background:${color};border-radius:3px"></div></div>
    <span style="font-size:11px;font-weight:600;color:${color}">${Math.round(line.usedPct)}%</span>
  </div>`;
}

export function renderBudgetPlanner(): void {
  const container = document.getElementById('ftab-budget');
  if (!container) return;

  const lines = budgetVsActual(_budgets, _ledger, _budYear, _budMonth);
  const totalBudget = lines.reduce((s, l) => s + l.budget, 0);
  const totalActual = lines.reduce((s, l) => s + l.actual, 0);
  const variance = totalBudget - totalActual;

  const years = availableYears(_ledger);
  const yearOpts = years.map(y => `<option value="${y}"${y === _budYear ? ' selected' : ''}>${y}</option>`).join('');
  const monthOpts = `<option value=""${_budMonth == null ? ' selected' : ''}>Whole Year</option>` +
    MONTH_NAMES.map((m, i) => `<option value="${i + 1}"${_budMonth === i + 1 ? ' selected' : ''}>${m}</option>`).join('');

  const rows = lines.length
    ? lines.map(l => `<tr>
        <td style="font-weight:500;color:var(--ink)">${escapeHtml(l.category)}</td>
        <td class="amount-cell">${l.budget ? formatCurrency(l.budget) : '—'}</td>
        <td class="amount-cell" style="color:var(--red)">${l.actual ? formatCurrency(l.actual) : '—'}</td>
        <td class="amount-cell" style="font-weight:600;color:${l.variance >= 0 ? 'var(--green)' : 'var(--red)'}">${formatCurrency(l.variance)}</td>
        <td style="min-width:120px">${_usageBar(l)}</td>
        <td><div class="flex-gap" style="gap:4px">${_lineActions(l)}</div></td>
      </tr>`).join('')
    : `<tr><td colspan="6"><div class="empty-state">No budgets or spending yet for this period — click "New Budget Line".</div></td></tr>`;

  container.innerHTML = `
    <div class="page-actions" style="margin-bottom:12px;gap:8px;flex-wrap:wrap;align-items:center">
      <select class="form-input" id="bud-year" onchange="setBudgetFilter()" style="width:120px">${yearOpts}</select>
      <select class="form-input" id="bud-month" onchange="setBudgetFilter()" style="width:150px">${monthOpts}</select>
      <div style="flex:1"></div>
      ${canManageFinance() ? `<button class="btn btn-primary" onclick="openAddBudget()">+ New Budget Line</button>` : ''}
    </div>
    <div class="finance-stat-grid" style="margin-bottom:16px">
      ${summaryCard('Total Budget', totalBudget)}
      ${summaryCard('Actual Spend', totalActual, { color: 'var(--red)' })}
      ${summaryCard('Remaining', variance, { color: variance >= 0 ? 'var(--green)' : 'var(--red)', sub: variance >= 0 ? 'Under budget' : 'Over budget' })}
    </div>
    <div style="border:1px solid var(--ink-4);overflow-x:auto">
      <table class="ledger-table">
        <thead><tr><th>Category</th><th>Budget</th><th>Actual</th><th>Variance</th><th>Used</th><th aria-label="Actions"></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// Only budgeted categories can be edited/deleted; unbudgeted (actual-only) rows
// offer a quick "Set Budget" that pre-fills the category.
function _lineActions(l: BudgetLine): string {
  const existing = _findBudget(l.category);
  if (existing) {
    return `<button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="openEditBudget(${existing.id})">Edit</button>
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--red)" onclick="handleDeleteBudget(${existing.id})">Delete</button>`;
  }
  return `<button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="openAddBudget('${escapeHtml(l.category)}')">Set Budget</button>`;
}

function _findBudget(category: string): Budget | undefined {
  return _budgets.find(b =>
    b.category === category && b.period_year === _budYear &&
    (_budMonth == null ? b.period_month == null : b.period_month === _budMonth));
}

function _budgetFormHTML(b: Partial<Budget>): string {
  const catOpts = EXPENSE_CATEGORIES.map(c => `<option${c === b.category ? ' selected' : ''}>${c}</option>`).join('');
  const scope = _budMonth == null ? `${_budYear} (whole year)` : `${MONTH_NAMES[_budMonth - 1]} ${_budYear}`;
  return `<div class="form-grid">
    <div class="form-group full"><div style="font-size:11px;color:var(--ink-3)">Budget for <strong>${scope}</strong></div></div>
    <div class="form-group"><div class="form-label">Category *</div><select class="form-input" id="bud-category">${catOpts}</select></div>
    <div class="form-group"><div class="form-label">Budget Amount (₱) *</div><input class="form-input" id="bud-amount" type="number" min="0" step="0.01" value="${b.amount ?? 0}"/></div>
    <div class="form-group full"><div class="form-label">Notes</div><input class="form-input" id="bud-notes" value="${escapeHtml(b.notes ?? '')}" placeholder="Optional"/></div>
  </div>`;
}

export function openAddBudget(category?: string): void {
  if (!canManageFinance()) { toast('You do not have permission to edit budgets', 'error'); return; }
  _editingBudgetId = null;
  openModal('New Budget Line', _budgetFormHTML(category ? { category } : {}), saveBudget);
}

export function openEditBudget(id: number): void {
  const b = _budgets.find(x => x.id === id);
  if (!b) return;
  _editingBudgetId = id;
  openModal('Edit Budget Line', _budgetFormHTML(b), saveBudget);
}

export async function saveBudget(): Promise<void> {
  if (!canManageFinance()) { toast('You do not have permission to edit budgets', 'error'); return; }
  const category = gVal('bud-category');
  const amount = +gVal('bud-amount') || 0;
  if (!category) { toast('Please choose a category', 'error'); return; }
  if (amount < 0) { toast('Budget cannot be negative', 'error'); return; }

  const payload: Partial<Budget> = {
    category,
    amount,
    period_year: _budYear,
    period_month: _budMonth,
    notes: gVal('bud-notes').trim() || null,
  };
  try {
    // Who made the change, same as every other finance module records.
    const user = await getCurrentUser();
    const actor = user?.name ?? user?.email ?? null;
    if (_editingBudgetId !== null) {
      const ok = await updateBudget(_editingBudgetId, payload);
      if (!ok) { toast('Could not update budget', 'error'); return; }
      await logDocActivity('budget', _editingBudgetId, category, 'updated', actor);
      toast('Budget updated', 'success');
    } else {
      const dup = _findBudget(category);
      if (dup) { toast('That category already has a budget for this period — edit it instead', 'error'); return; }
      const result = await createBudget(payload);
      if (!result) { toast('Could not save budget. Please try again.', 'error'); return; }
      await logDocActivity('budget', result.id, category, 'created', actor);
      toast('Budget line added', 'success');
    }
    closeModal();
    await loadFinance();
  } catch (error) {
    console.error('saveBudget failed:', error);
    toast('An unexpected error occurred. Please try again.', 'error');
  }
}

export async function handleDeleteBudget(id: number): Promise<void> {
  if (!canManageFinance()) { toast('You do not have permission to edit budgets', 'error'); return; }
  if (!confirm('Delete this budget line?')) return;
  try {
    const b = _budgets.find(x => x.id === id);
    const ok = await deleteBudget(id);
    if (!ok) { toast('Could not delete budget', 'error'); return; }
    const user = await getCurrentUser();
    await logDocActivity('budget', id, b?.category ?? null, 'deleted', user?.name ?? user?.email ?? null);
    toast('Budget line deleted', 'success');
    await loadFinance();
  } catch (error) {
    console.error('handleDeleteBudget failed:', error);
    toast('An unexpected error occurred. Please try again.', 'error');
  }
}

export function setBudgetFilter(): void {
  const yearVal = gVal('bud-year');
  const monthVal = gVal('bud-month');
  _budYear = yearVal ? Number(yearVal) : new Date().getFullYear();
  _budMonth = monthVal ? Number(monthVal) : null;
  renderBudgetPlanner();
}
