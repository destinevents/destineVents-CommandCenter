// Finance module orchestrator — owns loadFinance, the overview render, and
// re-exports everything app.ts needs from the AR / AP / BIR sub-modules.
import { formatCurrency } from '@shared/utils/formatUtils.ts';
import { escapeHtml } from '@shared/utils/helpers.ts';
import { displayDate } from './templates/invoices.ts';
import {
  fetchInvoices, fetchBills, fetchPayrollRuns, calcFinanceSummary,
} from '@hq/finance/financeService.ts';
import { fetchSOBs } from '@hq/finance/sobService.ts';
import { fetchClients } from '@hq/clients/clientService.ts';
import { fetchProjects } from '@hq/projects/projectService.ts';
import { fetchPartners } from '@hq/partners/partnerService.ts';
import { fetchBirFilings } from '@hq/finance/birService.ts';
import { fetchPurchaseOrders } from '@shared/services/documents/poService.ts';
import { fetchAccounts, fetchLedger } from '@hq/finance/ledgerService.ts';
import { fetchFounderCapital } from '@hq/finance/founderService.ts';
import { fetchBudgets } from '@hq/finance/budgetService.ts';
import {
  _projects, _invoices, _bills, _payroll, _birFilings, _sobs, _pos,
  _accounts, _ledger, _founderCapital,
  setClients, setProjects, setPartners, setInvoices, setBills,
  setPayroll, setBirFilings, setSOBs, setPOs,
  setAccounts, setLedger, setFounderCapital, setBudgets,
} from '@hq/core/state.ts';
import { cashPosition, founderEquity } from './ledgerCalc.ts';
import { monthlySummary, expenseByCategory, revenueByCategory } from './reportsCalc.ts';
import { barChartHTML } from './templates/reports.ts';
import { renderSOB } from './sob.ts';
import { renderPayroll } from './payroll.ts';
import type { Invoice, Bill } from '@shared/types.ts';

// ── Sub-module imports (circular refs are safe — used only in function bodies)
import {
  renderAR, renderARPipeline, renderReceivablesDashboard, renderOfficialReceipts,
  togglePaidInvoices, setInvoicePage, setORPage,
  toggleArchivedInvoices, openAddInvoice, openEditInvoice,
  saveInvoice, handleDeleteInvoice, openDuplicateInvoice, printInvoice,
  archiveInvoice, restoreInvoice, addInvoiceRow, recalcInvoice,
  togglePaymentFields, openRecordPayment, saveRecordPayment,
  openBpiQr, openRecordPaymentBpi, copyBpiText, downloadBpiQr,
  openPaymentLink, copyPaymentLink, openPaymentHistory,
  openARProjectSOB, advanceARProjectStage,
  sendInvoiceEmail, printOfficialReceipt, openInvoiceFromSOB,
} from './ar/ar.ts';
import {
  renderAP,
  setApFilter, clearApFilters, setApBillPage,
  openAddBill, openEditBill, saveBill, handleDeleteBill,
  openUploadReceipt, submitBillForApproval,
  approveBill, saveApproveBill, rejectBill,
  markBillPaid, archiveBill, printExpenseVoucher,
} from './ap/ap.ts';
import {
  renderPO,
  openAddPO, openEditPO, savePO, handleDeletePO,
  sendPO, approvePO, markPOFulfilled, cancelPO, archivePO, printPO,
  addPORow, recalcPO, setPOFilter, clearPOFilters, setPOPage,
} from './ap/po.ts';
import {
  renderBIR, showBIRTab, renderBIRReports,
  setBIRReportPeriod, setBIRReportYear, setBIRReportMonth, setBIRReportQuarter,
  printBIRReport, exportBIRReportCSV, exportBIRReportExcel,
  openFileBir, saveBirFiling,
} from './bir/bir.ts';
import {
  renderCashLedger, renderAccountsSettings,
  setLedgerFilter, clearLedgerFilters,
  openAddLedgerEntry, openEditLedgerEntry, handleDeleteLedgerEntry,
  openAddAccount, openEditAccount, handleDeleteAccount, setDefaultAccount,
} from './ledger.ts';
import {
  renderFounderCapital,
  openAddFounderEntry, openEditFounderEntry, handleDeleteFounderEntry,
} from './founder.ts';
import { renderProjections } from './projections.ts';
import { renderMonthlySummary, setMonthlySummaryFilter } from './monthlySummary.ts';
import {
  renderBudgetPlanner, openAddBudget, openEditBudget, saveBudget,
  handleDeleteBudget, setBudgetFilter,
} from './budget.ts';
import {
  renderReports, setReportType, setReportFilter,
  exportFinanceReportCSV, printFinanceReport,
} from './reports.ts';

// ── Re-export everything app.ts expects from a single finance entry point ─────
export {
  renderAR, renderARPipeline, renderReceivablesDashboard, renderOfficialReceipts,
  togglePaidInvoices, setInvoicePage, setORPage,
  toggleArchivedInvoices, openAddInvoice, openEditInvoice,
  saveInvoice, handleDeleteInvoice, openDuplicateInvoice, printInvoice,
  archiveInvoice, restoreInvoice, addInvoiceRow, recalcInvoice,
  togglePaymentFields, openRecordPayment, saveRecordPayment,
  openBpiQr, openRecordPaymentBpi, copyBpiText, downloadBpiQr,
  openPaymentLink, copyPaymentLink, openPaymentHistory,
  openARProjectSOB, advanceARProjectStage,
  sendInvoiceEmail, printOfficialReceipt, openInvoiceFromSOB,
  renderAP,
  setApFilter, clearApFilters, setApBillPage,
  openAddBill, openEditBill, saveBill, handleDeleteBill,
  openUploadReceipt, submitBillForApproval,
  approveBill, saveApproveBill, rejectBill,
  markBillPaid, archiveBill, printExpenseVoucher,
  renderPO,
  openAddPO, openEditPO, savePO, handleDeletePO,
  sendPO, approvePO, markPOFulfilled, cancelPO, archivePO, printPO,
  addPORow, recalcPO, setPOFilter, clearPOFilters, setPOPage,
  renderBIR, showBIRTab, renderBIRReports,
  setBIRReportPeriod, setBIRReportYear, setBIRReportMonth, setBIRReportQuarter,
  printBIRReport, exportBIRReportCSV, exportBIRReportExcel,
  openFileBir, saveBirFiling,
  // Cash Ledger + Settings
  renderCashLedger, renderAccountsSettings,
  setLedgerFilter, clearLedgerFilters,
  openAddLedgerEntry, openEditLedgerEntry, handleDeleteLedgerEntry,
  openAddAccount, openEditAccount, handleDeleteAccount, setDefaultAccount,
  // Founder Capital
  renderFounderCapital,
  openAddFounderEntry, openEditFounderEntry, handleDeleteFounderEntry,
  // Projections
  renderProjections,
  // Monthly Summary
  renderMonthlySummary, setMonthlySummaryFilter,
  // Budget Planner
  renderBudgetPlanner, openAddBudget, openEditBudget, saveBudget,
  handleDeleteBudget, setBudgetFilter,
  // Reports
  renderReports, setReportType, setReportFilter,
  exportFinanceReportCSV, printFinanceReport,
};

const gEl = (id: string) => document.getElementById(id)!;
let _menuListenersSetup = false;

export function toggleActionMenu(btn: HTMLElement) {
  document.querySelectorAll('.action-menu-dropdown.open').forEach(el => el.classList.remove('open'));
  const menu = btn.nextElementSibling as HTMLElement | null;
  if (!menu) return;
  const rect = btn.getBoundingClientRect();
  menu.style.top   = `${rect.bottom + 4}px`;
  menu.style.right = `${window.innerWidth - rect.right}px`;
  menu.classList.add('open');
}


export async function loadFinance() {
  const [inv, bil, pay, bir, clients, projs, parts, sobs, pos, accts, ledger, founder, budgets] = await Promise.all([
    fetchInvoices(),
    fetchBills(),
    fetchPayrollRuns(),
    fetchBirFilings(),
    fetchClients(),
    fetchProjects(),
    fetchPartners(),
    fetchSOBs(),
    fetchPurchaseOrders(),
    fetchAccounts(),
    fetchLedger(),
    fetchFounderCapital(),
    fetchBudgets(),
  ]);
  setClients(clients || []);
  setProjects(projs || []);
  setPartners(parts || []);
  setInvoices(inv || []);
  setBills(bil || []);
  setPayroll(pay || []);
  setBirFilings(bir || []);
  setSOBs(sobs || []);
  setPOs(pos || []);
  setAccounts(accts || []);
  setLedger(ledger || []);
  setFounderCapital(founder || []);
  setBudgets(budgets || []);
  if (!_menuListenersSetup) {
    _menuListenersSetup = true;
    document.addEventListener('click', e => {
      if (!(e.target as HTMLElement).closest('.action-menu'))
        document.querySelectorAll('.action-menu-dropdown.open').forEach(el => el.classList.remove('open'));
    }, { capture: true });
    document.addEventListener('scroll', () => {
      document.querySelectorAll('.action-menu-dropdown.open').forEach(el => el.classList.remove('open'));
    }, { capture: true, passive: true });
  }
  renderFinanceOverview(_invoices, _bills);
  renderReceivablesDashboard();
  renderARPipeline();
  renderAR(_invoices);
  renderOfficialReceipts();
  renderAP(_bills);
  renderPO(_pos);
  renderPayroll(_payroll);
  renderBIR();
  renderSOB(_sobs);
  renderCashLedger();
  renderFounderCapital();
  renderBudgetPlanner();
  renderMonthlySummary();
  renderProjections();
  renderReports();
  renderAccountsSettings();
}

export function showFinanceTab(name: string, el: HTMLElement) {
  document.querySelectorAll('.ftab').forEach(t => t.classList.remove('active'));
  gEl('ftab-' + name).classList.add('active');
  document.querySelectorAll('#finance-subtabs .sub-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
}

export function showReceivablesTab(name: string, el: HTMLElement) {
  document.querySelectorAll('#ftab-receivables .rtab').forEach(t => t.classList.remove('active'));
  gEl('rtab-' + name).classList.add('active');
  document.querySelectorAll('#receivables-subtabs .sub-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
}

export function showAnalysisTab(name: string, el: HTMLElement) {
  document.querySelectorAll('#ftab-analysis .atab').forEach(t => t.classList.remove('active'));
  gEl('ftab-' + name).classList.add('active');
  document.querySelectorAll('#analysis-subtabs .sub-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
}

export function showPayablesTab(name: string, el: HTMLElement) {
  document.querySelectorAll('#ftab-payables .ptab').forEach(t => t.classList.remove('active'));
  gEl('ptab-' + name).classList.add('active');
  document.querySelectorAll('#payables-subtabs .sub-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
}

function renderRevenueByProject(invoices: Invoice[], projects: typeof _projects) {
  const el = document.getElementById('finance-revenue-by-project');
  if (!el) return;
  const grouped: Record<string | number, Invoice[]> = {};
  invoices.forEach(inv => {
    const key = inv.project_id ?? 'unassigned';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(inv);
  });
  const rows = Object.entries(grouped)
    .map(([key, invs]) => {
      const proj = key !== 'unassigned' ? projects.find(p => p.id === +key) : null;
      const name = proj ? proj.name : 'Unassigned';
      const total       = invs.reduce((s, i) => s + (i.amount || 0), 0);
      const collected   = invs.filter(i => i.status === 'Paid').reduce((s, i) => s + (i.amount || 0), 0);
      const outstanding = total - collected;
      return { name, total, collected, outstanding, count: invs.length };
    })
    .sort((a, b) => b.total - a.total);
  if (!rows.length) { el.innerHTML = '<div class="empty-state">No invoices yet</div>'; return; }
  el.innerHTML = `
    <table class="ledger-table" style="margin-top:0">
      <thead><tr><th>Project</th><th style="text-align:right">Invoices</th><th style="text-align:right">Total</th><th style="text-align:right">Collected</th><th style="text-align:right">Outstanding</th></tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td style="font-weight:500;color:var(--ink)">${escapeHtml(r.name)}</td>
            <td style="text-align:right;font-size:11px;color:var(--ink-3)">${r.count}</td>
            <td class="amount-cell">${formatCurrency(r.total)}</td>
            <td class="amount-cell" style="color:var(--green)">${formatCurrency(r.collected)}</td>
            <td class="amount-cell" style="${r.outstanding > 0 ? 'color:var(--red)' : ''}">${formatCurrency(r.outstanding)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// The §2 Dashboard as 7 labeled KPI groups (Cash Position, Revenue, Expenses,
// Profitability, Cash Flow, Receivables & Payables, Founder Capital). Ledger
// figures come from the Cash Ledger + Founder Capital; AR/AP come from the
// invoice/bill summary. De-duplicated — one canonical card per metric.
function _dashboardGroupsHTML(summary: ReturnType<typeof calcFinanceSummary>): string {
  const pos  = cashPosition(_ledger, _accounts);
  const eq   = founderEquity(_founderCapital);
  const now  = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const thisMonth = monthlySummary(_ledger, _founderCapital, { year, month, projectId: null });
  const thisYear  = monthlySummary(_ledger, _founderCapital, { year, month: null, projectId: null });
  const allTime   = monthlySummary(_ledger, _founderCapital, { year: null, month: null, projectId: null });
  const activeCount = _accounts.filter(a => a.is_active).length;

  const card = (label: string, value: number, color = '', sub = '') =>
    `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value" style="font-size:22px${color ? `;color:${color}` : ''}">${formatCurrency(value)}</div>${sub ? `<div class="stat-change">${sub}</div>` : ''}</div>`;
  const group = (label: string, cards: string) =>
    `<div class="kpi-group"><div class="kpi-group-label">${label}</div><div class="finance-stat-grid">${cards}</div></div>`;

  return [
    group('Cash Position',
      card('Current Cash Balance', pos.total, 'var(--green)', `Across ${activeCount} account${activeCount !== 1 ? 's' : ''}`) +
      card('Cash on Hand', pos.byType.cash) +
      card('Bank Balance', pos.byType.bank) +
      card('E-wallet Balance', pos.byType.ewallet)),
    group('Revenue',
      card('Revenue This Month', thisMonth.revenue, 'var(--green)') +
      card('Revenue This Year', thisYear.revenue, 'var(--green)')),
    group('Expenses',
      card('Expenses This Month', thisMonth.expenses, 'var(--red)') +
      card('Expenses This Year', thisYear.expenses, 'var(--red)')),
    group('Profitability',
      card('Net Profit', thisYear.netProfit, thisYear.netProfit >= 0 ? 'var(--green)' : 'var(--red)', 'This year') +
      card('Gross Income', thisYear.grossProfit, '', 'Revenue − cost of services') +
      card('Operating Expenses', thisYear.expenses, '', 'This year')),
    group('Cash Flow',
      card('Total Cash In', allTime.totalCashIn, 'var(--green)', 'All time') +
      card('Total Cash Out', allTime.totalCashOut, 'var(--red)', 'All time')),
    group('Receivables & Payables',
      card('Accounts Receivable', summary.arOutstanding, '', `${summary.overdueCount} overdue invoice${summary.overdueCount !== 1 ? 's' : ''}`) +
      card('Accounts Payable', summary.apOutstanding, '', `${summary.pendingBillsCount} pending bills`)),
    group('Founder Capital',
      card('Capital Invested', eq.totalCapital) +
      card('Owner Withdrawals', eq.totalWithdrawals) +
      card('Net Owner Equity', eq.netEquity, '', 'Capital − withdrawals')),
  ].join('');
}

export function renderFinanceOverview(invoices: Invoice[], bills: Bill[]) {
  const summary = calcFinanceSummary(invoices, bills, _payroll);

  // ── KPI groups (handout §2) ─────────────────────────────────────────────────
  gEl('finance-stats').innerHTML = _dashboardGroupsHTML(summary);

  // ── Charts ────────────────────────────────────────────────────────────────
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleString('en-PH', { month: 'short' }) };
  });

  const revByMonth  = Object.fromEntries(months.map(m => [m.key, 0]));
  const expByMonth  = Object.fromEntries(months.map(m => [m.key, 0]));
  invoices.filter(i => i.status === 'Paid').forEach(i => {
    const k = (i.payment_date ?? i.date ?? '').slice(0, 7);
    if (k in revByMonth) revByMonth[k] += i.amount || 0;
  });
  bills.filter(b => b.status === 'Paid').forEach(b => {
    const k = (b.date ?? '').slice(0, 7);
    if (k in expByMonth) expByMonth[k] += b.amount || 0;
  });
  const maxRevExp = Math.max(...months.map(m => Math.max(revByMonth[m.key], expByMonth[m.key])), 1);
  const maxAR_AP  = Math.max(summary.arOutstanding, summary.apOutstanding, 1);

  // project profitability
  const projProfit: { name: string; amount: number }[] = [];
  const projMap: Record<string | number, number> = {};
  invoices.filter(i => i.status === 'Paid' && i.project_id).forEach(i => {
    projMap[i.project_id!] = (projMap[i.project_id!] || 0) + (i.amount || 0);
  });
  Object.entries(projMap).forEach(([pid, amt]) => {
    const proj = _projects.find(p => p.id === +pid);
    if (proj) projProfit.push({ name: proj.name, amount: amt });
  });
  projProfit.sort((a, b) => b.amount - a.amount);
  const maxProj = Math.max(...projProfit.map(p => p.amount), 1);

  const chartsEl = document.getElementById('finance-charts');
  if (chartsEl) {
    chartsEl.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
        <div class="card" style="padding:16px">
          <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:12px">Monthly Revenue vs Expenses</div>
          <div style="display:flex;align-items:flex-end;gap:6px;height:80px">
            ${months.map(m => `
              <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">
                <div style="display:flex;align-items:flex-end;gap:2px;height:64px">
                  <div style="width:10px;background:var(--gold);height:${Math.max(2, Math.round(revByMonth[m.key] / maxRevExp * 64))}px;border-radius:2px 2px 0 0"></div>
                  <div style="width:10px;background:var(--linen-3);height:${Math.max(2, Math.round(expByMonth[m.key] / maxRevExp * 64))}px;border-radius:2px 2px 0 0"></div>
                </div>
                <div style="font-size:9px;color:var(--ink-3)">${m.label}</div>
              </div>`).join('')}
          </div>
          <div style="display:flex;gap:12px;margin-top:8px">
            <div style="display:flex;align-items:center;gap:4px"><div style="width:8px;height:8px;background:var(--gold);border-radius:2px"></div><span style="font-size:10px;color:var(--ink-3)">Revenue</span></div>
            <div style="display:flex;align-items:center;gap:4px"><div style="width:8px;height:8px;background:var(--linen-3);border-radius:2px"></div><span style="font-size:10px;color:var(--ink-3)">Expenses</span></div>
          </div>
        </div>
        <div class="card" style="padding:16px">
          <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:12px">Cash Flow Trend</div>
          <div style="display:flex;align-items:center;gap:6px;height:80px">
            ${months.map(m => {
              const net2 = revByMonth[m.key] - expByMonth[m.key];
              const maxCF = Math.max(...months.map(x => Math.abs(revByMonth[x.key] - expByMonth[x.key])), 1);
              const h = Math.max(2, Math.round(Math.abs(net2) / maxCF * 60));
              return `
              <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">
                <div style="height:64px;display:flex;align-items:center">
                  <div style="width:14px;height:${h}px;background:${net2 >= 0 ? 'var(--green)' : 'var(--red)'};border-radius:2px;opacity:0.8"></div>
                </div>
                <div style="font-size:9px;color:var(--ink-3)">${m.label}</div>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
        <div class="card" style="padding:16px">
          <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:12px">Receivables vs Payables</div>
          <div style="display:flex;flex-direction:column;gap:10px">
            <div>
              <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:11px;color:var(--ink-2)">AR Outstanding</span><span style="font-size:11px;font-weight:600">${formatCurrency(summary.arOutstanding)}</span></div>
              <div style="height:8px;background:var(--linen-3);border-radius:4px"><div style="height:100%;width:${Math.round(summary.arOutstanding / maxAR_AP * 100)}%;background:var(--gold);border-radius:4px"></div></div>
            </div>
            <div>
              <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:11px;color:var(--ink-2)">AP Outstanding</span><span style="font-size:11px;font-weight:600">${formatCurrency(summary.apOutstanding)}</span></div>
              <div style="height:8px;background:var(--linen-3);border-radius:4px"><div style="height:100%;width:${Math.round(summary.apOutstanding / maxAR_AP * 100)}%;background:var(--red);border-radius:4px;opacity:0.7"></div></div>
            </div>
          </div>
        </div>
        <div class="card" style="padding:16px">
          <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:12px">Project Profitability</div>
          ${projProfit.length === 0
            ? '<div style="font-size:12px;color:var(--ink-3)">No paid invoices linked to projects yet</div>'
            : projProfit.slice(0, 5).map(p => `
              <div style="margin-bottom:8px">
                <div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="font-size:11px;color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:65%">${escapeHtml(p.name)}</span><span style="font-size:11px;font-weight:600">${formatCurrency(p.amount)}</span></div>
                <div style="height:6px;background:var(--linen-3);border-radius:3px"><div style="height:100%;width:${Math.round(p.amount / maxProj * 100)}%;background:var(--green);border-radius:3px;opacity:0.8"></div></div>
              </div>`).join('')}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
        ${barChartHTML('Expense by Category', expenseByCategory(_ledger), 'var(--red)')}
        ${barChartHTML('Revenue by Category', revenueByCategory(_ledger), 'var(--green)')}
      </div>`;
  }

  // ── Revenue by Project table ───────────────────────────────────────────────
  renderRevenueByProject(invoices, _projects);

  // ── Unified Recent Activity feed ───────────────────────────────────────────
  const activity = [
    ...invoices.map(i => ({
      text: i.status === 'Paid'
        ? `Payment received — ${escapeHtml(i.client ?? '')} · ${formatCurrency(i.amount)}`
        : `Invoice ${escapeHtml(i.or_num)} issued — ${escapeHtml(i.client ?? '')}`,
      time: i.status === 'Paid' ? (i.payment_date || i.date || i.created_at || '') : (i.created_at || i.date || ''),
      dot: i.status === 'Paid' ? 'green' : i.status === 'Overdue' ? 'red' : 'blue',
      sub: formatCurrency(i.amount),
    })),
    ...bills.map(b => ({
      text: `Expense — ${escapeHtml(b.payee ?? '')} · ${escapeHtml(b.category ?? '')}`,
      time: b.created_at || b.date || '',
      dot: b.status === 'Paid' ? 'green' : 'blue',
      sub: formatCurrency(b.amount),
    })),
    ..._payroll.filter(p => p.status === 'Paid').map(p => ({
      text: `Payroll paid — ${escapeHtml(p.period)}`,
      time: p.created_at || '',
      dot: 'green',
      sub: formatCurrency(p.net),
    })),
    ..._birFilings.map(f => ({
      text: `BIR filing — ${escapeHtml(f.form)} · ${escapeHtml(f.period)}`,
      time: f.created_at || '',
      dot: 'blue',
      sub: '',
    })),
  ].filter(a => a.time).sort((a, b) => b.time.localeCompare(a.time)).slice(0, 8);

  const activityEl = document.getElementById('finance-recent-activity');
  if (activityEl) {
    activityEl.innerHTML = activity.length === 0
      ? '<div style="font-size:12px;color:var(--ink-3);padding:12px 0">No recent activity</div>'
      : activity.map(a => `
        <div class="activity-item">
          <div class="activity-dot ${a.dot}"></div>
          <div style="flex:1"><div class="activity-text">${a.text}</div><div class="activity-time">${displayDate(a.time)}</div></div>
          ${a.sub ? `<div style="font-family:'Cormorant Garamond',serif;font-size:13px;font-weight:600;color:var(--ink-2)">${a.sub}</div>` : ''}
        </div>`).join('');
  }

  // Keep legacy AR/AP feeds if their containers still exist
  const arEl = document.getElementById('finance-recent-ar');
  const apEl = document.getElementById('finance-recent-ap');
  if (arEl) arEl.innerHTML = '';
  if (apEl) apEl.innerHTML = '';
}
