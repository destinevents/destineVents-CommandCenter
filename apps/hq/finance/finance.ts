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
import {
  _projects, _invoices, _bills, _payroll, _birFilings, _sobs,
  setClients, setProjects, setPartners, setInvoices, setBills,
  setPayroll, setBirFilings, setSOBs,
} from '@hq/core/state.ts';
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
  renderBIR, showBIRTab, renderBIRReports,
  setBIRReportPeriod, setBIRReportYear, setBIRReportMonth, setBIRReportQuarter,
  printBIRReport, exportBIRReportCSV, exportBIRReportExcel,
  openFileBir, saveBirFiling,
} from './bir/bir.ts';

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
  renderBIR, showBIRTab, renderBIRReports,
  setBIRReportPeriod, setBIRReportYear, setBIRReportMonth, setBIRReportQuarter,
  printBIRReport, exportBIRReportCSV, exportBIRReportExcel,
  openFileBir, saveBirFiling,
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
  const [inv, bil, pay, bir, clients, projs, parts, sobs] = await Promise.all([
    fetchInvoices(),
    fetchBills(),
    fetchPayrollRuns(),
    fetchBirFilings(),
    fetchClients(),
    fetchProjects(),
    fetchPartners(),
    fetchSOBs(),
  ]);
  setClients(clients || []);
  setProjects(projs || []);
  setPartners(parts || []);
  setInvoices(inv || []);
  setBills(bil || []);
  setPayroll(pay || []);
  setBirFilings(bir || []);
  setSOBs(sobs || []);
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
  renderPayroll(_payroll);
  renderBIR();
  renderSOB(_sobs);
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

export function renderFinanceOverview(invoices: Invoice[], bills: Bill[]) {
  const summary = calcFinanceSummary(invoices, bills, _payroll);
  const net     = summary.arOutstanding - summary.apOutstanding;

  // ── Stat Cards ────────────────────────────────────────────────────────────
  gEl('finance-stats').innerHTML = `
    <div class="stat-card"><div class="stat-label">AR Outstanding</div><div class="stat-value" style="font-size:22px">${formatCurrency(summary.arOutstanding)}</div><div class="stat-change">${summary.overdueCount} overdue invoice${summary.overdueCount !== 1 ? 's' : ''}</div></div>
    <div class="stat-card"><div class="stat-label">AP Outstanding</div><div class="stat-value" style="font-size:22px">${formatCurrency(summary.apOutstanding)}</div><div class="stat-change">${summary.pendingBillsCount} pending bills</div></div>
    <div class="stat-card"><div class="stat-label">Revenue Collected</div><div class="stat-value" style="font-size:22px">${formatCurrency(summary.revenueCollected)}</div><div class="stat-change up">All time</div></div>
    <div class="stat-card"><div class="stat-label">Net Position</div><div class="stat-value" style="font-size:22px${net < 0 ? ';color:var(--red)' : ''}">${formatCurrency(Math.abs(net))}</div><div class="stat-change ${net >= 0 ? 'up' : ''}">${net >= 0 ? 'Receivable surplus' : 'Payable deficit'}</div></div>
    <div class="stat-card"><div class="stat-label">Collected This Month</div><div class="stat-value" style="font-size:22px;color:var(--green)">${formatCurrency(summary.collectedThisMonth)}</div><div class="stat-change up">Paid invoices this month</div></div>
    <div class="stat-card"><div class="stat-label">Net Profit</div><div class="stat-value" style="font-size:22px${summary.netProfit < 0 ? ';color:var(--red)' : ';color:var(--green)'}">${formatCurrency(Math.abs(summary.netProfit))}</div><div class="stat-change ${summary.netProfit >= 0 ? 'up' : ''}">${summary.netProfit >= 0 ? 'Revenue − expenses' : 'Operating at a loss'}</div></div>
    <div class="stat-card"><div class="stat-label">Payroll Due</div><div class="stat-value" style="font-size:22px;color:var(--gold)">${formatCurrency(summary.payrollDue)}</div><div class="stat-change">Pending payroll runs</div></div>
    <div class="stat-card"><div class="stat-label">Cash Flow This Month</div><div class="stat-value" style="font-size:22px${summary.cashFlowThisMonth < 0 ? ';color:var(--red)' : ';color:var(--green)'}">${formatCurrency(Math.abs(summary.cashFlowThisMonth))}</div><div class="stat-change ${summary.cashFlowThisMonth >= 0 ? 'up' : ''}">${summary.cashFlowThisMonth >= 0 ? 'Positive cash flow' : 'Negative cash flow'}</div></div>
    <div class="stat-card"><div class="stat-label">Collected Today</div><div class="stat-value" style="font-size:22px;color:var(--green)">${formatCurrency(summary.collectedToday)}</div><div class="stat-change up">Payments received today</div></div>
    <div class="stat-card"><div class="stat-label">Avg Collection Time</div><div class="stat-value" style="font-size:22px">${summary.avgCollectionDays}<span style="font-size:14px;font-weight:400;color:var(--ink-3)"> days</span></div><div class="stat-change">Issue date → payment date</div></div>`;

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
