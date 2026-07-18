import { formatCurrency } from '@shared/utils/formatUtils.ts';
import { formatDateShort, todayISO } from '@shared/utils/dateUtils.ts';
import { escapeHtml, statusClass } from '@shared/utils/helpers.ts';
import { validateRequired } from '@shared/utils/validators.ts';
import { APP_SETTINGS } from '@config/settings.js';
import {
  paginationBar, invoiceRowHTML, lineItemRowHTML, invoiceFormHTML, orRowHTML, displayDate,
} from './templates/invoices.ts';
import {
  AP_CATEGORIES, AP_STATUSES, AP_STATUS_CLASS, apRowHTML, billFormHTML,
} from './templates/bills.ts';
import {
  fetchInvoices, createInvoice, updateInvoice, deleteInvoice,
  fetchBills, createBill, updateBill, deleteBill,
  fetchPayrollRuns,
  calcFinanceSummary, fetchLineItems, upsertLineItems,
} from '@shared/services/finance/financeService.ts';
import { fetchSOBs, updateSOB, createSOB } from '@shared/services/finance/sobService.ts';
import { createInvoicePaymentLink } from '@shared/services/finance/paymentService.ts';
import { fetchClients } from '@shared/services/crm/clientService.ts';
import { fetchProjects, updateProject } from '@shared/services/projects/projectService.ts';
import { fetchPartners } from '@shared/services/projects/partnerService.ts';
import { fetchBirFilings, createBirFiling } from '@shared/services/finance/birService.ts';
import { sb } from '@shared/services/core/supabase';
import { renderSOB } from './sob.ts';
import { renderPayroll } from './payroll.ts';
import {
  BIR_PERCENTAGE_TAX_RATE, BIR_8PCT_OPTION_RATE, birMostRecentCompletedQuarter,
  birQuarterLabel, bir2551qDeadline, bir1701qDeadline, bir1604cDeadline,
  birFilingStatus, birGrossReceipts, birExpenses, birCompWithholding,
  bir2307Bills, birIsFiled, birFilingsFor,
} from '@shared/business/birCalc.js';
import { _clients, _projects, _partners, _invoices, _bills, _payroll, _birFilings, _sobs, setClients, setProjects, setPartners, setInvoices, setBills, setPayroll, setBirFilings, setSOBs } from '@hq/state.ts';
import { toast, openModal, closeModal } from '@hq/ui.ts';
import type { Invoice, Bill, BirFiling, InvoiceLineItem, SOB } from '@shared/types.ts';

const gEl = (id: string) => document.getElementById(id)!;
const gVal = (id: string) => (document.getElementById(id) as HTMLInputElement).value;

let _editingInvoiceId: number | null  = null;
let _editingBillId: number | null     = null;
let _showArchivedInvoices             = false;
let _pendingSOBConvertId: number | null = null;
let _menuListenersSetup               = false;
let _showPaidInvoices                 = false;
let _paidInvoicePage                  = 1;
let _orPage                           = 1;
const INVOICE_PAGE_SIZE               = 10;
const OR_PAGE_SIZE                    = 10;

let _apFilterCategory   = '';
let _apFilterStatus     = '';
let _apFilterSearch     = '';
let _apFilterDateFrom   = '';
let _apFilterDateTo     = '';
let _apBillPage         = 1;
let _approvingBillId: number | null = null;
const AP_PAGE_SIZE      = 20;

export function toggleActionMenu(btn: HTMLElement) {
  document.querySelectorAll('.action-menu-dropdown.open').forEach(el => el.classList.remove('open'));
  const menu = btn.nextElementSibling as HTMLElement | null;
  if (!menu) return;
  const rect = btn.getBoundingClientRect();
  menu.style.top   = `${rect.bottom + 4}px`;
  menu.style.right = `${window.innerWidth - rect.right}px`;
  menu.classList.add('open');
}


export function togglePaidInvoices() {
  _showPaidInvoices = !_showPaidInvoices;
  _paidInvoicePage  = 1;
  renderAR(_invoices);
}

export function setInvoicePage(page: number) {
  _paidInvoicePage = page;
  renderAR(_invoices);
}

export function setORPage(page: number) {
  _orPage = page;
  renderOfficialReceipts();
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

// ── AR Billing Pipeline ────────────────────────────────────────────────────────

const AR_PIPELINE = [
  'Proposal Approved',
  'Statement of Billing',
  'Invoice',
  'Payment',
  'Official Receipt',
  'Completed',
] as const;
type ARStage = typeof AR_PIPELINE[number];

export function renderARPipeline() {
  const el = document.getElementById('ar-pipeline');
  if (!el) return;
  const active = _projects.filter(p => AR_PIPELINE.includes(p.status as ARStage) && p.status !== 'Completed');
  if (!active.length) { el.innerHTML = ''; return; }
  const sorted = [...active].sort((a, b) =>
    AR_PIPELINE.indexOf(a.status as ARStage) - AR_PIPELINE.indexOf(b.status as ARStage)
  );
  const s = 'padding:3px 8px;font-size:11px;color:var(--blue)';
  el.innerHTML = `
    <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:8px">Billing Pipeline (${active.length})</div>
    <div style="border:1px solid var(--ink-4);overflow:hidden;margin-bottom:16px">
      <table class="ledger-table">
        <thead><tr><th>Project</th><th>Client</th><th>Value</th><th>Stage</th><th></th></tr></thead>
        <tbody>
          ${sorted.map(p => {
            const idx = AR_PIPELINE.indexOf(p.status as ARStage);
            let nextBtn = '';
            if (idx === 0) nextBtn = `<button class="btn btn-ghost" style="${s}" onclick="openARProjectSOB(${p.id})">→ SOB</button>`;
            else if (idx === 1) nextBtn = `<span style="font-size:11px;color:var(--ink-3)">Use SOB → Invoice below</span>`;
            else if (idx === 2) nextBtn = `<button class="btn btn-ghost" style="${s}" onclick="advanceARProjectStage(${p.id})">→ Payment</button>`;
            else if (idx === 3) nextBtn = `<button class="btn btn-ghost" style="${s}" onclick="advanceARProjectStage(${p.id})">→ OR</button>`;
            else if (idx === 4) nextBtn = `<button class="btn btn-ghost" style="${s}" onclick="advanceARProjectStage(${p.id})">→ Complete</button>`;
            return `<tr>
              <td style="font-weight:500;color:var(--ink)">${escapeHtml(p.name)}</td>
              <td style="font-size:11px;color:var(--ink-2)">${escapeHtml(p.client || '—')}</td>
              <td class="amount-cell">${formatCurrency(p.value)}</td>
              <td><span class="badge badge-${statusClass(p.status)}">${escapeHtml(p.status)}</span></td>
              <td><div class="flex-gap" style="gap:4px">${nextBtn}</div></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

export function openARProjectSOB(id: number) {
  const p = _projects.find(x => x.id === id);
  if (!p) return;
  openModal('Create Statement of Billing', `<div class="form-grid">
    <div class="form-group"><div class="form-label">SOB Number</div><input class="form-input" id="arsob-num" placeholder="SOB-2026-001"/></div>
    <div class="form-group"><div class="form-label">Client</div><input class="form-input" id="arsob-client" value="${escapeHtml(p.client || '')}"/></div>
    <div class="form-group"><div class="form-label">Amount (₱)</div><input class="form-input" id="arsob-amount" type="number" value="${p.value || 0}" min="0"/></div>
    <div class="form-group"><div class="form-label">Issue Date</div><input class="form-input" id="arsob-issue" type="date" value="${todayISO()}"/></div>
    <div class="form-group"><div class="form-label">Due Date</div><input class="form-input" id="arsob-due" type="date"/></div>
    <div class="form-group full" style="font-size:11px;color:var(--ink-3)">Project: <strong>${escapeHtml(p.name)}</strong> · ${formatCurrency(p.value)}</div>
  </div>`, async () => {
    const sob_num = (document.getElementById('arsob-num') as HTMLInputElement).value.trim();
    if (!sob_num) { toast('SOB number is required', 'error'); return; }
    const amount = +(document.getElementById('arsob-amount') as HTMLInputElement).value || 0;
    const result = await createSOB({
      sob_num,
      client:       (document.getElementById('arsob-client') as HTMLInputElement).value.trim(),
      total_amount: amount,
      subtotal:     amount,
      discount:     0,
      vat_amount:   0,
      issue_date:   (document.getElementById('arsob-issue') as HTMLInputElement).value || null,
      due_date:     (document.getElementById('arsob-due') as HTMLInputElement).value || null,
      project_id:   p.id,
      status:       'Draft',
      currency:     'PHP',
    });
    if (!result) { toast('Could not create SOB. Please try again.', 'error'); return; }
    await updateProject(p.id, { status: 'Statement of Billing', updated_at: new Date().toISOString() });
    toast('SOB created — project moved to Statement of Billing', 'success');
    closeModal();
    loadFinance();
  });
}


export async function advanceARProjectStage(id: number) {
  const p = _projects.find(x => x.id === id);
  if (!p) return;
  const idx = AR_PIPELINE.indexOf(p.status as ARStage);
  if (idx === -1 || idx >= AR_PIPELINE.length - 1) return;
  const nextStage = AR_PIPELINE[idx + 1];
  const ok = await updateProject(id, { status: nextStage, updated_at: new Date().toISOString() });
  if (!ok) { toast('Could not update project status', 'error'); return; }
  toast(`Advanced to: ${nextStage}`, 'success');
  loadFinance();
}

// ── Receivables Dashboard ─────────────────────────────────────────────────────

export function renderReceivablesDashboard() {
  const el = document.getElementById('receivables-stats');
  if (!el) return;
  const summary = calcFinanceSummary(_invoices, _bills, _payroll);
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px">
      <div class="stat-card" style="padding:10px 12px">
        <div class="stat-label">Outstanding</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:700;color:var(--amber)">${formatCurrency(summary.arOutstanding)}</div>
      </div>
      <div class="stat-card" style="padding:10px 12px">
        <div class="stat-label">Overdue</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:700;color:var(--red)">${formatCurrency(summary.overdueTotal)}</div>
        <div style="font-size:10px;color:var(--ink-3);margin-top:2px">${summary.overdueCount} invoice${summary.overdueCount !== 1 ? 's' : ''}</div>
      </div>
      <div class="stat-card" style="padding:10px 12px">
        <div class="stat-label">Collected Today</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:700;color:var(--green)">${formatCurrency(summary.collectedToday)}</div>
      </div>
      <div class="stat-card" style="padding:10px 12px">
        <div class="stat-label">Collected This Month</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:700;color:var(--green)">${formatCurrency(summary.collectedThisMonth)}</div>
      </div>
      <div class="stat-card" style="padding:10px 12px">
        <div class="stat-label">Avg Collection Time</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:700">${summary.avgCollectionDays}<span style="font-size:12px;font-weight:400;color:var(--ink-3)"> days</span></div>
      </div>
    </div>`;
}

// ── AR (Invoices) ─────────────────────────────────────────────────────────────

export function renderAR(invoices: Invoice[]) {
  const archivedCount = invoices.filter(i => i.archived_at).length;
  const toggleBtn = document.getElementById('ar-archive-toggle');

  // ── Archived mode: flat list ───────────────────────────────────────────────
  if (_showArchivedInvoices) {
    const archived = invoices.filter(i => i.archived_at);
    const total    = archived.reduce((s, i) => s + i.amount, 0);
    gEl('ar-summary').textContent = `${archived.length} archived invoice${archived.length !== 1 ? 's' : ''} · ${formatCurrency(total)} total`;
    if (toggleBtn) toggleBtn.textContent = 'Hide Archived';
    gEl('ar-tbody').innerHTML = archived.length
      ? archived.map(i => invoiceRowHTML(i, _sobs, !!APP_SETTINGS.banking.bpiQrImageUrl)).join('')
      : `<tr><td colspan="7"><div class="empty-state">No archived invoices</div></td></tr>`;
    const recentPayEl = document.getElementById('ar-recent-payments');
    if (recentPayEl) recentPayEl.innerHTML = '';
    return;
  }

  // ── Normal mode: Active / Cancelled / Paid groups ─────────────────────────
  const nonArchived = invoices.filter(i => !i.archived_at);
  const active      = nonArchived.filter(i => !['Paid', 'Cancelled'].includes(i.status));
  const paid        = nonArchived
    .filter(i => i.status === 'Paid')
    .sort((a, b) => (b.payment_date || b.date || '').localeCompare(a.payment_date || a.date || ''));
  const cancelled   = nonArchived.filter(i => i.status === 'Cancelled');
  const outstanding = active.reduce((s, i) => s + i.amount, 0);
  const totalAll    = nonArchived.reduce((s, i) => s + i.amount, 0);

  gEl('ar-summary').textContent =
    `${nonArchived.length} invoice${nonArchived.length !== 1 ? 's' : ''} · ${formatCurrency(totalAll)} total · ${formatCurrency(outstanding)} outstanding`;
  if (toggleBtn) toggleBtn.textContent = `Archived (${archivedCount})`;

  // Active rows (always shown, no pagination)
  const activeRows = active.length
    ? active.map(i => invoiceRowHTML(i, _sobs, !!APP_SETTINGS.banking.bpiQrImageUrl)).join('')
    : `<tr><td colspan="7"><div class="empty-state" style="padding:10px 0">No active invoices — all clear!</div></td></tr>`;

  // Cancelled rows (usually few, no pagination)
  const cancelledRows = cancelled.length
    ? `<tr style="background:var(--linen-2)">
         <td colspan="7" style="padding:5px 14px;font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3)">
           Cancelled (${cancelled.length})
         </td>
       </tr>
       ${cancelled.map(i => invoiceRowHTML(i, _sobs, !!APP_SETTINGS.banking.bpiQrImageUrl)).join('')}`
    : '';

  // Paid group: collapsible + paginated
  const paidTotal  = paid.reduce((s, i) => s + i.amount, 0);
  const pStart     = (_paidInvoicePage - 1) * INVOICE_PAGE_SIZE;
  const paidPage   = paid.slice(pStart, pStart + INVOICE_PAGE_SIZE);
  const pagBar     = paginationBar(_paidInvoicePage, paid.length, INVOICE_PAGE_SIZE, 'setInvoicePage');

  const paidHeader = `
    <tr style="background:var(--linen-2);cursor:pointer;user-select:none" onclick="togglePaidInvoices()">
      <td colspan="7" style="padding:8px 14px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2)">${_showPaidInvoices ? '▾' : '▸'} Paid (${paid.length})</span>
          ${paid.length > 0 ? `<span style="font-size:12px;color:var(--green);font-family:'Cormorant Garamond',serif;font-weight:700">${formatCurrency(paidTotal)}</span>` : ''}
          <span style="font-size:10px;color:var(--ink-3);margin-left:auto">${_showPaidInvoices ? 'click to collapse' : 'click to expand'}</span>
        </div>
      </td>
    </tr>`;

  const paidRows = _showPaidInvoices && paid.length > 0
    ? paidPage.map(i => invoiceRowHTML(i, _sobs, !!APP_SETTINGS.banking.bpiQrImageUrl)).join('')
    : '';

  const pagRow = _showPaidInvoices && pagBar
    ? `<tr><td colspan="7" style="padding:0">${pagBar}</td></tr>`
    : '';

  gEl('ar-tbody').innerHTML = activeRows + cancelledRows + paidHeader + paidRows + pagRow;

  // ── Recent Payments ────────────────────────────────────────────────────────
  const recentPayEl = document.getElementById('ar-recent-payments');
  if (recentPayEl) {
    const recentPaid = paid.slice(0, 5);
    if (recentPaid.length) {
      recentPayEl.innerHTML = `
        <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:8px">Recent Payments</div>
        ${recentPaid.map(p => `
          <div class="activity-item">
            <div class="activity-dot green"></div>
            <div style="flex:1">
              <div class="activity-text">${escapeHtml(p.client ?? '—')} · ${escapeHtml(p.or_num)}</div>
              <div class="activity-time">${p.payment_date ? displayDate(p.payment_date) : displayDate(p.date)}${p.payment_method ? ` · ${escapeHtml(p.payment_method)}` : ''}</div>
            </div>
            <div style="font-family:'Cormorant Garamond',serif;font-size:13px;font-weight:600;color:var(--green)">${formatCurrency(p.amount)}</div>
          </div>`).join('')}`;
    } else {
      recentPayEl.innerHTML = '';
    }
  }
}

export function toggleArchivedInvoices() {
  _showArchivedInvoices = !_showArchivedInvoices;
  renderAR(_invoices);
}


export function openAddInvoice() {
  _editingInvoiceId    = null;
  _pendingSOBConvertId = null;
  const unlinkedSOBs = _sobs.filter(s => !s.linked_invoice_id && !s.archived_at && !['Paid','Cancelled'].includes(s.status));
  const sobTip = unlinkedSOBs.length > 0
    ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:4px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:#1e40af">
        💡 <strong>${unlinkedSOBs.length} unlinked SOB${unlinkedSOBs.length !== 1 ? 's' : ''}</strong> exist (${unlinkedSOBs.map(s => escapeHtml(s.sob_num)).join(', ')}). Consider converting one instead of creating manually.
      </div>`
    : `<div style="background:var(--linen-3);border:1px solid var(--ink-4);border-radius:4px;padding:8px 14px;margin-bottom:16px;font-size:12px;color:var(--ink-3)">
        Creating a standalone invoice — not linked to a Statement of Billing.
      </div>`;
  openModal('New Invoice (AR)', sobTip + invoiceFormHTML({}, [], _clients, _projects), saveInvoice);
}

export function openInvoiceFromSOB(draft: Partial<Invoice>, items: InvoiceLineItem[], sobId: number) {
  _editingInvoiceId   = null;
  _pendingSOBConvertId = sobId;
  openModal('New Invoice from SOB', invoiceFormHTML(draft, items, _clients, _projects), saveInvoice);
}

export async function openEditInvoice(id: number) {
  const i = _invoices.find(x => x.id === id);
  if (!i) return;
  _editingInvoiceId = id;
  const items = await fetchLineItems(id);
  openModal('Edit Invoice', invoiceFormHTML(i, items, _clients, _projects), saveInvoice);
}

export async function saveInvoice() {
  const or_num = gVal('fi-or').trim();
  const err = validateRequired(or_num, 'OR number');
  if (err) { toast(err, 'error'); return; }
  const amount = +gVal('fi-amount');
  if (!amount || amount <= 0) { toast('Amount must be greater than ₱0 (add line items or enter amount directly)', 'error'); return; }
  const projVal = (document.getElementById('fi-project') as HTMLInputElement | null)?.value;
  const status  = gVal('fi-status');

  const rows = document.querySelectorAll<HTMLTableRowElement>('#fi-line-rows .li-row');
  const lineItems: InvoiceLineItem[] = [];
  rows.forEach(row => {
    const description = (row.querySelector('.li-desc') as HTMLInputElement).value.trim();
    const quantity    = +(row.querySelector('.li-qty') as HTMLInputElement).value  || 1;
    const unit_price  = +(row.querySelector('.li-price') as HTMLInputElement).value || 0;
    const vat_rate    = +(row.querySelector('.li-vat') as HTMLInputElement).value  || 0;
    if (description) lineItems.push({ description, quantity, unit_price, vat_rate });
  });

  const subtotal  = lineItems.reduce((s, li) => s + li.quantity * li.unit_price, 0);
  const vatAmount = lineItems.reduce((s, li) => s + li.quantity * li.unit_price * li.vat_rate / 100, 0);

  const payload: Partial<Invoice> = {
    or_num,
    client:     gVal('fi-client'),
    amount,
    status,
    date:       gVal('fi-date') || null,
    due:        gVal('fi-due')  || null,
  };
  if (projVal) payload.project_id = +projVal;

  // Only include new columns when they have values — avoids PGRST204 if
  // the schema cache hasn't refreshed after the migration yet.
  const notes           = (document.getElementById('fi-notes') as HTMLTextAreaElement | null)?.value.trim() || '';
  const tin             = (document.getElementById('fi-tin') as HTMLInputElement | null)?.value.trim() || '';
  const businessAddress = (document.getElementById('fi-address') as HTMLInputElement | null)?.value.trim() || '';
  const payMethod       = (document.getElementById('fi-pay-method') as HTMLSelectElement | null)?.value || '';
  const payRef          = (document.getElementById('fi-pay-ref') as HTMLInputElement | null)?.value.trim() || '';
  const payDate         = (document.getElementById('fi-pay-date') as HTMLInputElement | null)?.value || '';
  const receivedBy      = (document.getElementById('fi-received-by') as HTMLInputElement | null)?.value.trim() || '';
  if (lineItems.length)  { payload.subtotal = subtotal; payload.vat_amount = vatAmount; }
  if (notes)             payload.notes             = notes;
  if (tin)               payload.tin               = tin;
  if (businessAddress)   payload.business_address  = businessAddress;
  if (payMethod)         payload.payment_method    = payMethod;
  if (payRef)            payload.payment_reference = payRef;
  if (payDate)           payload.payment_date      = payDate;
  if (receivedBy)        payload.received_by       = receivedBy;

  let invoiceId = _editingInvoiceId;
  if (invoiceId) {
    const ok = await updateInvoice(invoiceId, payload);
    if (!ok) { toast('Could not update invoice', 'error'); return; }
    toast('Invoice updated', 'success');
  } else {
    const result = await createInvoice(payload);
    if (!result) { toast('Could not add invoice. Please try again.', 'error'); return; }
    invoiceId = result.id;
    toast('Invoice added', 'success');
  }

  if (invoiceId && lineItems.length) {
    await upsertLineItems(invoiceId, lineItems);
  }

  if (_pendingSOBConvertId && invoiceId) {
    await updateSOB(_pendingSOBConvertId, { linked_invoice_id: invoiceId, status: 'Sent' } as Partial<SOB>);
    _pendingSOBConvertId = null;
  }

  closeModal();
  loadFinance();
}

export async function handleDeleteInvoice(id: number) {
  if (!confirm('Delete this invoice? This cannot be undone.')) return;
  // Clear the SOB link so it doesn't point to a deleted invoice
  const linkedSOB = _sobs.find(s => s.linked_invoice_id === id);
  if (linkedSOB) {
    await updateSOB(linkedSOB.id, { linked_invoice_id: null, status: 'Sent' } as Partial<SOB>);
  }
  const ok = await deleteInvoice(id);
  if (!ok) { toast('Could not delete invoice', 'error'); return; }
  toast('Invoice deleted', '');
  loadFinance();
}

export async function openDuplicateInvoice(id: number) {
  const original = _invoices.find(x => x.id === id);
  if (!original) return;
  const items = await fetchLineItems(id);
  _editingInvoiceId = null;
  const draft: Partial<Invoice> = {
    client:     original.client,
    amount:     original.amount,
    status:     'Draft',
    date:       null,
    due:        null,
    project_id: original.project_id,
    notes:      original.notes,
    subtotal:   original.subtotal,
    vat_amount: original.vat_amount,
    discount:   original.discount,
  };
  openModal('Duplicate Invoice', invoiceFormHTML(draft, items, _clients, _projects), saveInvoice);
  toast('Duplicated — enter a new OR number and save', '');
}

export async function printInvoice(id: number) {
  const inv = _invoices.find(x => x.id === id);
  if (!inv) return;
  const items  = await fetchLineItems(id);
  const subtotal  = inv.subtotal ?? items.reduce((s, li) => s + li.quantity * li.unit_price, 0);
  const vatAmount = inv.vat_amount ?? items.reduce((s, li) => s + li.quantity * li.unit_price * li.vat_rate / 100, 0);
  const { banking } = APP_SETTINGS;
  const proj = _projects.find(p => p.id === inv.project_id);
  const lineRowsHTML = items.length
    ? items.map(li => {
        const lineAmt = li.quantity * li.unit_price * (1 + li.vat_rate / 100);
        return `<tr>
          <td style="padding:8px 10px;border-bottom:1px solid #e8e3da">${escapeHtml(li.description)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e8e3da;text-align:right">${li.quantity}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e8e3da;text-align:right">${formatCurrency(li.unit_price)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e8e3da;text-align:right">${li.vat_rate}%</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e8e3da;text-align:right;font-weight:600">${formatCurrency(lineAmt)}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="5" style="padding:8px 10px;color:#888">—</td></tr>`;
  const w = window.open('', '_blank', 'width=860,height=700');
  if (!w) { toast('Pop-up blocked — please allow pop-ups and try again', 'error'); return; }
  w.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Invoice ${escapeHtml(inv.or_num)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;background:#fff;padding:48px}
  .brand{font-size:28px;font-weight:700;letter-spacing:-0.5px}
  .brand span{font-weight:300;color:#666}
  .tagline{font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#888;margin-top:3px}
  .inv-title{font-size:22px;font-weight:600;color:#999;text-align:right}
  .inv-or{font-size:30px;font-weight:700;text-align:right;letter-spacing:-0.5px}
  table.items{width:100%;border-collapse:collapse;margin:20px 0}
  table.items thead th{background:#f5f0e8;padding:8px 10px;text-align:left;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#666}
  table.items thead th:not(:first-child){text-align:right}
  .label{font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#888;margin-bottom:3px}
  .value{font-size:13px;color:#1a1a1a}
  .total-row{display:flex;justify-content:space-between;font-size:13px;padding:4px 0}
  .total-final{font-size:20px;font-weight:700;border-top:2px solid #1a1a1a;padding-top:10px;margin-top:8px;display:flex;justify-content:space-between}
  .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase}
  .badge-paid{background:#d4f5e2;color:#1a7a45}
  .badge-unpaid{background:#fef3c7;color:#92400e}
  .badge-overdue{background:#fee2e2;color:#991b1b}
  .footer{margin-top:48px;padding-top:18px;border-top:1px solid #e8e3da;font-size:10px;color:#aaa;text-align:center;line-height:1.8}
  @media print{body{padding:24px}.no-print{display:none}}
</style>
</head>
<body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px">
  <div>
    <div class="brand">destine<span>vents</span></div>
    <div class="tagline">DestineVents Collective OPC</div>
    <div style="font-size:11px;color:#888;margin-top:8px;line-height:1.7">
      Baguio City, Philippines<br>
      ${escapeHtml(banking.bpiAccountName)}<br>
      BPI Account: ${escapeHtml(banking.bpiAccountNumber)}
    </div>
  </div>
  <div style="text-align:right">
    <div class="inv-title">${inv.status === 'Paid' ? 'OFFICIAL RECEIPT' : 'INVOICE'}</div>
    <div class="inv-or">${escapeHtml(inv.or_num)}</div>
    <div style="margin-top:8px">
      <span class="badge badge-${inv.status === 'Paid' ? 'paid' : inv.status === 'Overdue' ? 'overdue' : 'unpaid'}">${escapeHtml(inv.status)}</span>
    </div>
  </div>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-bottom:32px;padding-bottom:24px;border-bottom:1px solid #e8e3da">
  <div>
    <div class="label">Billed To</div>
    <div class="value" style="font-weight:600;font-size:15px">${escapeHtml(inv.client ?? '—')}</div>
    ${inv.tin ? `<div style="font-size:11px;color:#888;margin-top:2px">TIN: ${escapeHtml(inv.tin)}</div>` : ''}
    ${inv.business_address ? `<div style="font-size:11px;color:#888;margin-top:2px">${escapeHtml(inv.business_address)}</div>` : ''}
    ${proj ? `<div style="font-size:11px;color:#888;margin-top:3px">Project: ${escapeHtml(proj.name)}</div>` : ''}
  </div>
  <div>
    <div class="label">Date Issued</div>
    <div class="value">${inv.date ? formatDateShort(inv.date) : '—'}</div>
    <div class="label" style="margin-top:10px">Due Date</div>
    <div class="value">${inv.due ? formatDateShort(inv.due) : '—'}</div>
  </div>
  <div>
    ${inv.status === 'Paid' ? `
    <div class="label">Payment Date</div>
    <div class="value">${inv.payment_date ? formatDateShort(inv.payment_date) : '—'}</div>
    <div class="label" style="margin-top:10px">Payment Method</div>
    <div class="value">${escapeHtml(inv.payment_method ?? '—')}</div>
    ${inv.payment_reference ? `<div style="font-size:11px;color:#888;margin-top:2px">Ref: ${escapeHtml(inv.payment_reference)}</div>` : ''}
    ` : ''}
  </div>
</div>

${items.length > 0 ? `
<table class="items">
  <thead><tr>
    <th style="width:45%">Description</th>
    <th style="width:10%">Qty</th>
    <th style="width:15%">Unit Price</th>
    <th style="width:10%">VAT</th>
    <th style="width:20%">Amount</th>
  </tr></thead>
  <tbody>${lineRowsHTML}</tbody>
</table>
<div style="display:flex;justify-content:flex-end">
  <div style="width:280px">
    <div class="total-row"><span style="color:#888">Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
    ${vatAmount > 0 ? `<div class="total-row"><span style="color:#888">VAT</span><span>${formatCurrency(vatAmount)}</span></div>` : ''}
    <div class="total-final"><span>Total Due</span><span>${formatCurrency(inv.amount)}</span></div>
  </div>
</div>` : `
<div style="display:flex;justify-content:flex-end;margin:32px 0">
  <div style="width:280px">
    <div class="total-final"><span>Total Due</span><span>${formatCurrency(inv.amount)}</span></div>
  </div>
</div>`}

${inv.notes ? `<div style="margin-top:24px;padding:14px;background:#f9f6f0;border-radius:6px;font-size:12px;color:#555;line-height:1.7"><strong>Notes:</strong> ${escapeHtml(inv.notes)}</div>` : ''}

<div style="margin-top:20px;no-print" class="no-print">
  <button onclick="window.print()" style="padding:8px 20px;background:#1a1a1a;color:#fff;border:none;border-radius:4px;font-size:13px;cursor:pointer">Print / Save as PDF</button>
</div>

<div class="footer">
  DestineVents Collective OPC · Baguio City, Philippines · destinevents.biz@gmail.com<br>
  Thank you for your trust and partnership.
</div>
</body>
</html>`);
  w.document.close();
  w.focus();
}

export async function archiveInvoice(id: number) {
  const ok = await updateInvoice(id, { archived_at: new Date().toISOString() } as Partial<Invoice>);
  if (!ok) { toast('Could not archive invoice', 'error'); return; }
  toast('Invoice archived', '');
  loadFinance();
}

export async function restoreInvoice(id: number) {
  const ok = await updateInvoice(id, { archived_at: null } as Partial<Invoice>);
  if (!ok) { toast('Could not restore invoice', 'error'); return; }
  toast('Invoice restored', '');
  loadFinance();
}

export function addInvoiceRow() {
  const tbody = document.getElementById('fi-line-rows');
  if (!tbody) return;
  tbody.insertAdjacentHTML('beforeend', lineItemRowHTML());
  recalcInvoice();
}

export function recalcInvoice() {
  const rows = document.querySelectorAll<HTMLTableRowElement>('#fi-line-rows .li-row');
  let subtotal = 0;
  let vatTotal = 0;
  rows.forEach(row => {
    const qty   = +(row.querySelector('.li-qty')   as HTMLInputElement).value || 0;
    const price = +(row.querySelector('.li-price') as HTMLInputElement).value || 0;
    const vat   = +(row.querySelector('.li-vat')   as HTMLInputElement).value || 0;
    const lineSub = qty * price;
    const lineVat = lineSub * vat / 100;
    subtotal += lineSub;
    vatTotal += lineVat;
    const amtCell = row.querySelector('.li-amt');
    if (amtCell) amtCell.textContent = formatCurrency(lineSub + lineVat);
  });
  const total = subtotal + vatTotal;
  const stEl  = document.getElementById('fi-subtotal');
  const vatEl = document.getElementById('fi-vat-display');
  const totEl = document.getElementById('fi-total-display');
  const amtEl = document.getElementById('fi-amount') as HTMLInputElement | null;
  if (stEl)  stEl.textContent  = formatCurrency(subtotal);
  if (vatEl) vatEl.textContent = formatCurrency(vatTotal);
  if (totEl) totEl.textContent = formatCurrency(total);
  if (amtEl) {
    amtEl.value    = String(total);
    amtEl.readOnly = rows.length > 0;
  }
}

export function togglePaymentFields(status: string) {
  const section = document.getElementById('fi-payment-section');
  if (section) section.style.display = status === 'Paid' ? 'block' : 'none';
  const cancelEl = document.getElementById('fi-status') as HTMLSelectElement | null;
  if (cancelEl) {
    const row = cancelEl.closest('.form-group');
    if (row) (row as HTMLElement).style.opacity = status === 'Cancelled' ? '0.6' : '1';
  }
}

export function openRecordPayment(id: number) {
  const inv = _invoices.find(x => x.id === id);
  if (!inv) return;
  if (inv.status === 'Paid') { toast('This invoice is already marked as paid', 'error'); return; }
  _editingInvoiceId = id;
  const payMethodOpts = ['GCash', 'BPI', 'PayMongo', 'Cash', 'Check', 'Bank Transfer', 'Other']
    .map(m => `<option value="${m}">${m}</option>`).join('');
  openModal(`Record Payment — ${escapeHtml(inv.or_num)}`, `
    <div style="margin-bottom:14px;font-size:13px;color:var(--ink-2)">
      Recording payment from <strong>${escapeHtml(inv.client ?? '')}</strong><br>
      <span style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:700;color:var(--ink)">${formatCurrency(inv.amount)}</span>
    </div>
    <div class="form-grid">
      <div class="form-group"><div class="form-label">Payment Method</div>
        <select class="form-input" id="rp-method">
          <option value="">— select —</option>
          ${payMethodOpts}
        </select>
      </div>
      <div class="form-group"><div class="form-label">Reference / Check #</div><input class="form-input" id="rp-ref" placeholder="GCash ref, BPI confirmation, etc."/></div>
      <div class="form-group"><div class="form-label">Payment Date</div><input class="form-input" id="rp-date" type="date" value="${todayISO()}"/></div>
      <div class="form-group"><div class="form-label">Received By</div><input class="form-input" id="rp-received" placeholder="Your name or team member"/></div>
    </div>`, saveRecordPayment);
}

export async function saveRecordPayment() {
  if (!_editingInvoiceId) return;
  const method = (document.getElementById('rp-method') as HTMLSelectElement).value;
  if (!method) { toast('Please select a payment method', 'error'); return; }
  const payload: Partial<Invoice> = {
    status:            'Paid',
    payment_method:    method,
    payment_reference: (document.getElementById('rp-ref') as HTMLInputElement).value.trim() || null,
    payment_date:      (document.getElementById('rp-date') as HTMLInputElement).value || null,
    received_by:       (document.getElementById('rp-received') as HTMLInputElement).value.trim() || null,
  };
  const ok = await updateInvoice(_editingInvoiceId, payload);
  if (!ok) { toast('Could not record payment', 'error'); return; }
  toast('Payment recorded — invoice marked as Paid', 'success');
  const paidId = _editingInvoiceId;
  closeModal();
  loadFinance();
  setTimeout(() => printOfficialReceipt(paidId), 400);
}

export function openBpiQr(id: number, amount: number, client: string, orNum: string) {
  const { banking } = APP_SETTINGS;
  const bpiBranch = (banking as typeof banking & { bpiBranch?: string }).bpiBranch ?? '';
  const copyText = `BPI Transfer Details:\nAccount Name: ${banking.bpiAccountName}\nBranch: ${bpiBranch}\nAccount Number: ${banking.bpiAccountNumber}\nAmount: ₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}\nFor: ${orNum} — ${client}`;
  openModal('BPI Business QR — Pay via Bank Transfer', `
    <div style="text-align:center;margin-bottom:16px">
      <img src="${escapeHtml(banking.bpiQrImageUrl)}" alt="BPI QR Code" style="max-width:220px;border-radius:8px;border:1px solid var(--border)"/>
    </div>
    <div style="font-size:13px;line-height:2.2;border:1px solid var(--border);border-radius:8px;padding:12px 16px;margin-bottom:14px">
      <div><span style="color:var(--ink-3)">Invoice #:</span> <strong>${escapeHtml(orNum)}</strong></div>
      <div><span style="color:var(--ink-3)">Account Name:</span> <strong>${escapeHtml(banking.bpiAccountName)}</strong></div>
      <div><span style="color:var(--ink-3)">Branch:</span> <strong>${escapeHtml(bpiBranch)}</strong></div>
      <div><span style="color:var(--ink-3)">Account Number:</span> <strong>${escapeHtml(banking.bpiAccountNumber)}</strong></div>
      <div><span style="color:var(--ink-3)">Amount:</span> <strong style="font-family:'Cormorant Garamond',serif;font-size:20px">${formatCurrency(amount)}</strong></div>
      <div><span style="color:var(--ink-3)">Client:</span> <strong>${escapeHtml(client)}</strong></div>
    </div>
    <textarea class="form-input" id="bpi-copy-text" rows="5" readonly style="font-size:11px;font-family:monospace">${escapeHtml(copyText)}</textarea>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn btn-primary" style="flex:1" onclick="copyBpiText()">Copy Bank Details</button>
      <button class="btn btn-ghost" style="flex:1;border:1px solid var(--border)" onclick="downloadBpiQr()">Download QR</button>
    </div>
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
      <div style="font-size:11px;color:var(--ink-3);margin-bottom:8px">Once the client has transferred payment, record it here:</div>
      <button class="btn btn-ghost" style="width:100%;border:1px solid var(--green);color:var(--green);font-weight:600" onclick="openRecordPaymentBpi(${id})">✓ Record BPI Payment Received</button>
    </div>`, () => closeModal());
}

export function openRecordPaymentBpi(id: number) {
  openRecordPayment(id);
  setTimeout(() => {
    const sel = document.getElementById('rp-method') as HTMLSelectElement | null;
    if (sel) sel.value = 'BPI';
  }, 50);
}

export function copyBpiText() {
  const el = document.getElementById('bpi-copy-text') as HTMLTextAreaElement | null;
  if (!el) return;
  navigator.clipboard.writeText(el.value)
    .then(() => toast('Bank details copied', 'success'))
    .catch(() => toast('Could not copy — please copy manually', 'error'));
}

export function downloadBpiQr() {
  const { banking } = APP_SETTINGS;
  const a = document.createElement('a');
  a.href = banking.bpiQrImageUrl;
  a.download = 'DestineVents-BPI-QR.png';
  a.click();
}

export async function openPaymentLink(id: number, amount: number, client: string, orNum: string) {
  const btn = document.querySelector(`[onclick*="openPaymentLink(${id},"]`) as HTMLButtonElement | null;
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }

  const result = await createInvoicePaymentLink({
    invoiceId:   id,
    amount,
    description: `Invoice ${orNum} — ${client || 'DestineVents client'}`,
  });

  if (btn) { btn.disabled = false; btn.textContent = 'Pay Link'; }

  if (!result) {
    toast('Could not generate payment link. Check PayMongo config.', 'error');
    return;
  }

  openModal('Payment Link Generated', `
    <div style="margin-bottom:12px;font-size:13px;color:var(--ink-2)">
      Share this link with <strong>${escapeHtml(client)}</strong> to collect payment for <strong>${escapeHtml(orNum)}</strong>.
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <input class="form-input" id="pm-link-url" value="${escapeHtml(result.paymentUrl)}" readonly style="flex:1;font-size:12px"/>
      <button class="btn btn-primary" style="white-space:nowrap" onclick="copyPaymentLink()">Copy</button>
    </div>
    <div style="margin-top:10px;font-size:11px;color:var(--ink-3)">
      The invoice will automatically update to <strong>Paid</strong> once the client completes payment.
    </div>`, () => closeModal());

  toast('Payment link generated', 'success');
  loadFinance();
}

export function copyPaymentLink() {
  const input = document.getElementById('pm-link-url') as HTMLInputElement | null;
  if (!input) return;
  navigator.clipboard.writeText(input.value)
    .then(() => toast('Link copied to clipboard', 'success'))
    .catch(() => toast('Could not copy — please copy manually', 'error'));
}

export function openPaymentHistory(id: number) {
  const inv = _invoices.find(x => x.id === id);
  if (!inv || inv.status !== 'Paid') return;
  const linkedSOB = _sobs.find(s => s.linked_invoice_id === id);
  const proj      = _projects.find(p => p.id === inv.project_id);
  openModal(`Payment History — ${escapeHtml(inv.or_num)}`, `
    <div style="font-size:11px;color:var(--ink-3);margin-bottom:14px">
      ${escapeHtml(inv.client ?? '—')}${proj ? ` · ${escapeHtml(proj.name)}` : ''}
    </div>
    <div style="border:1px solid var(--border);border-radius:6px;overflow:hidden">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <tbody>
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:8px 12px;color:var(--ink-3);width:40%">Payment Date</td>
            <td style="padding:8px 12px;font-weight:500">${inv.payment_date ? displayDate(inv.payment_date) : '—'}</td>
          </tr>
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:8px 12px;color:var(--ink-3)">Amount Paid</td>
            <td style="padding:8px 12px;font-weight:600;font-family:'Cormorant Garamond',serif;font-size:16px;color:var(--green)">${formatCurrency(inv.amount)}</td>
          </tr>
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:8px 12px;color:var(--ink-3)">Payment Method</td>
            <td style="padding:8px 12px;font-weight:500">${escapeHtml(inv.payment_method ?? '—')}</td>
          </tr>
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:8px 12px;color:var(--ink-3)">Reference Number</td>
            <td style="padding:8px 12px;font-weight:500">${escapeHtml(inv.payment_reference ?? '—')}</td>
          </tr>
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:8px 12px;color:var(--ink-3)">Received By</td>
            <td style="padding:8px 12px;font-weight:500">${escapeHtml(inv.received_by ?? '—')}</td>
          </tr>
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:8px 12px;color:var(--ink-3)">Linked SOB</td>
            <td style="padding:8px 12px;font-weight:500">${linkedSOB ? escapeHtml(linkedSOB.sob_num) : '—'}</td>
          </tr>
          ${inv.notes ? `<tr><td style="padding:8px 12px;color:var(--ink-3)">Notes</td><td style="padding:8px 12px">${escapeHtml(inv.notes)}</td></tr>` : ''}
        </tbody>
      </table>
    </div>`, closeModal, 'Close');
}

// ── Official Receipts ─────────────────────────────────────────────────────────

export function renderOfficialReceipts() {
  const sorted = [..._invoices]
    .filter(i => i.status === 'Paid' && !i.archived_at)
    .sort((a, b) => (b.payment_date || b.date || '').localeCompare(a.payment_date || a.date || ''));
  const summaryEl = document.getElementById('or-summary');
  const tbodyEl   = document.getElementById('or-tbody');
  const pagEl     = document.getElementById('or-pagination');

  if (summaryEl) {
    const total = sorted.reduce((s, i) => s + (i.amount || 0), 0);
    summaryEl.textContent = `${sorted.length} official receipt${sorted.length !== 1 ? 's' : ''} · ${formatCurrency(total)} collected`;
  }
  if (!tbodyEl) return;

  if (!sorted.length) {
    tbodyEl.innerHTML = `<tr><td colspan="8"><div class="empty-state">No official receipts yet — paid invoices will appear here</div></td></tr>`;
    if (pagEl) pagEl.innerHTML = '';
    return;
  }

  const pStart    = (_orPage - 1) * OR_PAGE_SIZE;
  const pageRows  = sorted.slice(pStart, pStart + OR_PAGE_SIZE);

  tbodyEl.innerHTML = pageRows.map(i =>
    orRowHTML(i, i.project_id ? _projects.find(p => p.id === i.project_id) : null, _sobs.find(s => s.linked_invoice_id === i.id))
  ).join('');

  if (pagEl) pagEl.innerHTML = paginationBar(_orPage, sorted.length, OR_PAGE_SIZE, 'setORPage');
}

export async function printOfficialReceipt(id: number) {
  const inv = _invoices.find(x => x.id === id);
  if (!inv) return;
  if (inv.status !== 'Paid') { toast('OR can only be printed for paid invoices', 'error'); return; }
  const linkedSOB  = _sobs.find(s => s.linked_invoice_id === id);
  const proj       = _projects.find(p => p.id === inv.project_id);
  const { banking } = APP_SETTINGS;
  const w = window.open('', '_blank', 'width=860,height=700');
  if (!w) { toast('Pop-up blocked — please allow pop-ups and try again', 'error'); return; }
  w.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Official Receipt ${escapeHtml(inv.or_num)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;background:#fff;padding:48px}
  .brand{font-size:28px;font-weight:700;letter-spacing:-0.5px}
  .brand span{font-weight:300;color:#666}
  .tagline{font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#888;margin-top:3px}
  .doc-title{font-size:22px;font-weight:600;color:#999;text-align:right}
  .doc-num{font-size:30px;font-weight:700;text-align:right;letter-spacing:-0.5px}
  .label{font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#888;margin-bottom:3px}
  .value{font-size:13px;color:#1a1a1a}
  .pay-box{background:#f5f9f2;border:1px solid #c8e6c9;border-radius:8px;padding:20px 24px;margin:32px 0}
  .pay-amount{font-size:36px;font-weight:700;color:#1a7a45;margin:8px 0 4px}
  .footer{margin-top:48px;padding-top:18px;border-top:1px solid #e8e3da;font-size:10px;color:#aaa;text-align:center;line-height:1.8}
  @media print{body{padding:24px}.no-print{display:none}}
</style>
</head>
<body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px">
  <div>
    <div class="brand">destine<span>vents</span></div>
    <div class="tagline">DestineVents Collective OPC</div>
    <div style="font-size:11px;color:#888;margin-top:8px;line-height:1.7">
      Baguio City, Philippines<br>
      ${escapeHtml(banking.bpiAccountName)}<br>
      BPI Account: ${escapeHtml(banking.bpiAccountNumber)}
    </div>
  </div>
  <div style="text-align:right">
    <div class="doc-title">OFFICIAL RECEIPT</div>
    <div class="doc-num">${escapeHtml(inv.or_num)}</div>
    <div style="margin-top:8px;font-size:11px;color:#888">
      Linked Invoice: ${escapeHtml(inv.or_num)}${linkedSOB ? ` · SOB: ${escapeHtml(linkedSOB.sob_num)}` : ''}
    </div>
  </div>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;padding-bottom:24px;border-bottom:1px solid #e8e3da">
  <div>
    <div class="label">Received From</div>
    <div class="value" style="font-weight:600;font-size:15px">${escapeHtml(inv.client ?? '—')}</div>
    ${inv.tin ? `<div style="font-size:11px;color:#888;margin-top:2px">TIN: ${escapeHtml(inv.tin)}</div>` : ''}
    ${inv.business_address ? `<div style="font-size:11px;color:#888;margin-top:2px">${escapeHtml(inv.business_address)}</div>` : ''}
    ${proj ? `<div style="font-size:11px;color:#888;margin-top:3px">Project: ${escapeHtml(proj.name)}</div>` : ''}
  </div>
  <div>
    <div class="label">Payment Date</div>
    <div class="value" style="font-weight:600">${inv.payment_date ? formatDateShort(inv.payment_date) : '—'}</div>
    ${inv.received_by ? `<div class="label" style="margin-top:10px">Received By</div><div class="value">${escapeHtml(inv.received_by)}</div>` : ''}
  </div>
</div>

<div class="pay-box">
  <div class="label">Amount Paid</div>
  <div class="pay-amount">₱${(inv.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
    <div>
      <div class="label">Payment Method</div>
      <div class="value" style="font-weight:600">${escapeHtml(inv.payment_method ?? '—')}</div>
    </div>
    ${inv.payment_reference ? `<div><div class="label">Reference Number</div><div class="value" style="font-weight:600">${escapeHtml(inv.payment_reference)}</div></div>` : ''}
  </div>
</div>

${inv.notes ? `<div style="margin-top:16px;padding:14px;background:#f9f6f0;border-radius:6px;font-size:12px;color:#555;line-height:1.7"><strong>Notes:</strong> ${escapeHtml(inv.notes)}</div>` : ''}

<div style="margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:32px">
  <div style="border-top:1px solid #1a1a1a;padding-top:8px;text-align:center">
    <div style="font-size:11px;color:#888">Issued By</div>
    <div style="font-size:12px;margin-top:24px">${inv.received_by ? escapeHtml(inv.received_by) : '___________________________'}</div>
  </div>
  <div style="border-top:1px solid #1a1a1a;padding-top:8px;text-align:center">
    <div style="font-size:11px;color:#888">Client Acknowledgement</div>
    <div style="font-size:12px;margin-top:24px">___________________________</div>
  </div>
</div>

<div style="margin-top:20px" class="no-print">
  <button onclick="window.print()" style="padding:8px 20px;background:#1a1a1a;color:#fff;border:none;border-radius:4px;font-size:13px;cursor:pointer">Print / Save as PDF</button>
</div>

<div class="footer">
  DestineVents Collective OPC · Baguio City, Philippines · destinevents.biz@gmail.com<br>
  This is an official receipt of payment. Thank you for your partnership.
</div>
</body>
</html>`);
  w.document.close();
  w.focus();
}

export function sendInvoiceEmail(id: number) {
  const inv = _invoices.find(x => x.id === id);
  if (!inv) return;
  const isOR       = inv.status === 'Paid';
  const docLabel   = isOR ? 'Official Receipt' : 'Invoice';
  const defaultSubject = `${docLabel} ${escapeHtml(inv.or_num)} — ${escapeHtml(inv.client ?? 'Client')}`;
  const defaultBody = [
    `Dear ${inv.client ?? 'Client'},`,
    '',
    isOR
      ? `Please find attached the Official Receipt ${inv.or_num} confirming payment of ${formatCurrency(inv.amount)} received on ${inv.payment_date ? formatDateShort(inv.payment_date) : 'file'}.`
      : `Please find attached Invoice ${inv.or_num} amounting to ${formatCurrency(inv.amount)}.`,
    !isOR && inv.due ? `Payment is due on ${formatDateShort(inv.due)}.` : '',
    '',
    'Please do not hesitate to reach out should you have any questions.',
    '',
    'Thank you for your continued partnership.',
  ].filter(Boolean).join('\n');

  openModal(`Send ${docLabel} via Email`, `
    <div style="font-size:11px;color:var(--ink-3);margin-bottom:12px">
      ${docLabel} <strong>${escapeHtml(inv.or_num)}</strong> · ${formatCurrency(inv.amount)}${!isOR && inv.due ? ' · Due ' + formatDateShort(inv.due) : ''}
    </div>
    <div class="form-grid">
      <div class="form-group full"><div class="form-label">To (Recipient Email)</div><input class="form-input" id="iem-to" type="email" placeholder="client@example.com"/></div>
      <div class="form-group full"><div class="form-label">CC (optional)</div><input class="form-input" id="iem-cc" type="email" placeholder="colleague@example.com"/></div>
      <div class="form-group full"><div class="form-label">Subject</div><input class="form-input" id="iem-subject" value="${escapeHtml(defaultSubject)}"/></div>
      <div class="form-group full"><div class="form-label">Message</div><textarea class="form-input" id="iem-body" rows="8" style="font-size:11.5px;line-height:1.6">${escapeHtml(defaultBody)}</textarea></div>
    </div>
    <div style="font-size:10.5px;color:var(--ink-3);margin-top:8px">
      This will open your email client. Attach the PDF (click <strong>${isOR ? 'Print OR' : 'Print'}</strong> first to save it).
    </div>`, async () => {
    const to      = (document.getElementById('iem-to')      as HTMLInputElement).value.trim();
    const cc      = (document.getElementById('iem-cc')      as HTMLInputElement).value.trim();
    const subject = (document.getElementById('iem-subject') as HTMLInputElement).value.trim();
    const body    = (document.getElementById('iem-body')    as HTMLTextAreaElement).value.trim();
    if (!to) { toast('Recipient email is required', 'error'); return; }
    const ccPart = cc ? `&cc=${encodeURIComponent(cc)}` : '';
    window.open(`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}${ccPart}&body=${encodeURIComponent(body)}`);
    if (!isOR && inv.status === 'Draft') {
      await updateInvoice(id, { status: 'Issued' } as Partial<Invoice>);
    }
    toast('Email client opened', 'success');
    closeModal();
    loadFinance();
  }, 'Open Email Client');
}

// ── AP (Payables) ─────────────────────────────────────────────────────────────

export function setApFilter() {
  _apFilterCategory = (document.getElementById('ap-filter-cat')    as HTMLSelectElement | null)?.value ?? '';
  _apFilterStatus   = (document.getElementById('ap-filter-status') as HTMLSelectElement | null)?.value ?? '';
  _apFilterSearch   = (document.getElementById('ap-filter-search') as HTMLInputElement  | null)?.value.toLowerCase() ?? '';
  _apFilterDateFrom = (document.getElementById('ap-filter-from')   as HTMLInputElement  | null)?.value ?? '';
  _apFilterDateTo   = (document.getElementById('ap-filter-to')     as HTMLInputElement  | null)?.value ?? '';
  _apBillPage = 1;
  renderAP(_bills);
}

export function clearApFilters() {
  _apFilterCategory = '';
  _apFilterStatus   = '';
  _apFilterSearch   = '';
  _apFilterDateFrom = '';
  _apFilterDateTo   = '';
  _apBillPage = 1;
  renderAP(_bills);
}

export function setApBillPage(p: number) {
  _apBillPage = p;
  renderAP(_bills);
}

export function renderAP(bills: Bill[]) {
  const container = document.getElementById('ftab-payables');
  if (!container) return;

  const active    = bills.filter(b => !b.archived_at);
  const now       = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const pendingBills     = active.filter(b => b.status === 'Pending');
  const forApprovalBills = active.filter(b => b.status === 'For Approval');
  const approvedBills    = active.filter(b => b.status === 'Approved');
  const paidThisMonth    = active.filter(b => b.status === 'Paid' && (b.date ?? '').startsWith(thisMonth));

  let filtered = active;
  if (_apFilterCategory) filtered = filtered.filter(b => b.category === _apFilterCategory);
  if (_apFilterStatus)   filtered = filtered.filter(b => b.status   === _apFilterStatus);
  if (_apFilterSearch)   filtered = filtered.filter(b =>
    (b.vendor ?? b.payee ?? '').toLowerCase().includes(_apFilterSearch) ||
    (b.expense_number ?? '').toLowerCase().includes(_apFilterSearch)
  );
  if (_apFilterDateFrom) filtered = filtered.filter(b => !!b.date && b.date >= _apFilterDateFrom);
  if (_apFilterDateTo)   filtered = filtered.filter(b => !!b.date && b.date <= _apFilterDateTo);

  const hasFilters = !!(  _apFilterCategory || _apFilterStatus || _apFilterSearch || _apFilterDateFrom || _apFilterDateTo);
  const total      = filtered.length;
  const paged      = filtered.slice((_apBillPage - 1) * AP_PAGE_SIZE, _apBillPage * AP_PAGE_SIZE);

  const sumOf = (arr: Bill[]) => arr.reduce((s, b) => s + b.amount, 0);

  container.innerHTML = `
    <div class="finance-stat-grid" style="margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">Pending</div>
        <div class="stat-value" style="font-size:22px">${formatCurrency(sumOf(pendingBills))}</div>
        <div class="stat-change">${pendingBills.length} expense${pendingBills.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Awaiting Approval</div>
        <div class="stat-value" style="font-size:22px;color:var(--amber)">${forApprovalBills.length}</div>
        <div class="stat-change">${formatCurrency(sumOf(forApprovalBills))}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Approved</div>
        <div class="stat-value" style="font-size:22px;color:var(--blue)">${formatCurrency(sumOf(approvedBills))}</div>
        <div class="stat-change">${approvedBills.length} expense${approvedBills.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Paid This Month</div>
        <div class="stat-value" style="font-size:22px;color:var(--green)">${formatCurrency(sumOf(paidThisMonth))}</div>
        <div class="stat-change">${paidThisMonth.length} payment${paidThisMonth.length !== 1 ? 's' : ''}</div>
      </div>
    </div>

    <div class="page-actions" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;gap:8px;flex:1;flex-wrap:wrap;align-items:center">
        <input class="form-input" id="ap-filter-search" placeholder="Search vendor or expense #…" value="${escapeHtml(_apFilterSearch)}" oninput="setApFilter()" style="width:220px"/>
        <select class="form-input" id="ap-filter-cat" onchange="setApFilter()" style="width:160px">
          <option value="">All Categories</option>
          ${AP_CATEGORIES.map(c => `<option${_apFilterCategory === c ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('')}
        </select>
        <select class="form-input" id="ap-filter-status" onchange="setApFilter()" style="width:150px">
          <option value="">All Statuses</option>
          ${AP_STATUSES.map(s => `<option${_apFilterStatus === s ? ' selected' : ''}>${escapeHtml(s)}</option>`).join('')}
        </select>
        <input class="form-input" id="ap-filter-from" type="date" value="${_apFilterDateFrom}" onchange="setApFilter()" title="From date" style="width:140px"/>
        <input class="form-input" id="ap-filter-to"   type="date" value="${_apFilterDateTo}"   onchange="setApFilter()" title="To date"   style="width:140px"/>
        ${hasFilters ? `<button class="btn btn-ghost" onclick="clearApFilters()" style="font-size:12px">Clear filters</button>` : ''}
      </div>
      <button class="btn btn-primary" onclick="openAddBill()">+ New Expense</button>
    </div>

    <div style="border:1px solid var(--ink-4);overflow:hidden">
      <table class="ledger-table">
        <thead>
          <tr>
            <th>Expense #</th>
            <th>Vendor</th>
            <th>Category</th>
            <th>Project</th>
            <th>Date</th>
            <th>Due Date</th>
            <th>Amount</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${paged.length
            ? paged.map(b => apRowHTML(b, _projects)).join('')
            : `<tr><td colspan="9"><div class="empty-state">${hasFilters ? 'No expenses match filters' : 'No expenses yet'}</div></td></tr>`}
        </tbody>
      </table>
      ${paginationBar(_apBillPage, total, AP_PAGE_SIZE, 'setApBillPage')}
    </div>`;
}

// ── Receipt storage helpers ───────────────────────────────────────────────────

const RECEIPT_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

async function uploadReceiptFile(file: File): Promise<string | null> {
  if (file.size > 5 * 1024 * 1024) {
    toast('Receipt file must be under 5 MB', 'error');
    return null;
  }
  const ext  = (file.name.split('.').pop() ?? 'bin').slice(0, 10);
  const path = `receipts/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from('receipts').upload(path, file, { upsert: false });
  if (error) {
    toast('Receipt upload failed', 'error');
    return null;
  }
  const { data } = await sb.storage.from('receipts').createSignedUrl(path, RECEIPT_TTL_SECONDS);
  return data?.signedUrl ?? null;
}

async function deleteReceiptFile(url: string | null | undefined): Promise<void> {
  if (!url) return;
  try {
    const match = url.match(/\/object\/(?:sign|public)\/receipts\/([^?#]+)/);
    if (match?.[1]) await sb.storage.from('receipts').remove([match[1]]);
  } catch { /* non-critical: orphaned file is preferable to a blocking error */ }
}

export function openAddBill() {
  _editingBillId = null;
  openModal('New Expense', billFormHTML({}, false, _projects, APP_SETTINGS.finance.ewtRates as string[]), saveBill);
}

export function openEditBill(id: number) {
  const b = _bills.find(x => x.id === id);
  if (!b) return;
  _editingBillId = id;
  openModal('Edit Expense', billFormHTML(b, true, _projects, APP_SETTINGS.finance.ewtRates as string[]), saveBill);
}

export async function saveBill() {
  const vendor = (document.getElementById('fb-vendor') as HTMLInputElement).value.trim();
  const err = validateRequired(vendor, 'Vendor');
  if (err) { toast(err, 'error'); return; }
  const amount = +((document.getElementById('fb-amount') as HTMLInputElement).value);
  if (!amount || amount <= 0) { toast('Amount must be greater than ₱0', 'error'); return; }

  const projVal  = (document.getElementById('fb-project')     as HTMLSelectElement).value;
  const expInput = (document.getElementById('fb-expense-num') as HTMLInputElement).value.trim();
  const expenseNumber = expInput
    || (_editingBillId
      ? (_bills.find(b => b.id === _editingBillId)?.expense_number ?? null)
      : `EXP-${new Date().getFullYear()}-${String(_bills.filter(b => !b.archived_at).length + 1).padStart(3, '0')}`);

  // ── Receipt file upload ────────────────────────────────────────────────────
  const existingBill  = _editingBillId ? _bills.find(b => b.id === _editingBillId) : null;
  let receiptUrl: string | null = existingBill?.receipt_url ?? null;

  const fileInput = document.getElementById('fb-receipt-file') as HTMLInputElement | null;
  const file = fileInput?.files?.[0] ?? null;
  if (file) {
    const uploaded = await uploadReceiptFile(file);
    if (!uploaded) return;
    await deleteReceiptFile(existingBill?.receipt_url);
    receiptUrl = uploaded;
  }

  const payload: Partial<Bill> = {
    vendor,
    payee:          vendor,
    expense_number: expenseNumber,
    amount,
    category:       (document.getElementById('fb-category')    as HTMLSelectElement).value,
    project_id:     projVal ? +projVal : null,
    invoice_number: (document.getElementById('fb-invoice-num') as HTMLInputElement).value.trim()    || null,
    purchase_order: (document.getElementById('fb-po')          as HTMLInputElement).value.trim()    || null,
    date:           (document.getElementById('fb-bill-date')   as HTMLInputElement).value           || null,
    due_date:       (document.getElementById('fb-due-date')    as HTMLInputElement).value           || null,
    ewt:            (document.getElementById('fb-ewt')         as HTMLSelectElement).value,
    receipt_url:    receiptUrl,
    remarks:        (document.getElementById('fb-remarks')     as HTMLTextAreaElement).value.trim() || null,
  };

  if (_editingBillId) {
    const statusEl = document.getElementById('fb-status') as HTMLSelectElement | null;
    if (statusEl) payload.status = statusEl.value;
    const ok = await updateBill(_editingBillId, payload);
    if (!ok) { toast('Could not update expense', 'error'); return; }
    toast('Expense updated', 'success');
  } else {
    payload.status = 'Pending';
    const result = await createBill(payload);
    if (!result) { toast('Could not add expense. Please try again.', 'error'); return; }
    toast('Expense added', 'success');
  }
  closeModal();
  loadFinance();
}

export function openUploadReceipt(id: number) {
  const b = _bills.find(x => x.id === id);
  if (!b) return;
  openModal(
    `Upload Receipt — ${escapeHtml(b.vendor ?? b.payee ?? '')}`,
    `<div style="margin-bottom:12px;font-size:11px;color:var(--ink-3)">
       ${b.receipt_url
         ? `Current receipt: <a href="${escapeHtml(b.receipt_url)}" target="_blank" rel="noopener noreferrer" style="color:var(--blue)">View</a> · Upload a new file to replace it.`
         : 'No receipt attached yet.'}
     </div>
     <div class="form-group">
       <div class="form-label">Receipt File (JPG, PNG or PDF — max 5 MB)</div>
       <input class="form-input" id="ur-file" type="file" accept="image/*,.pdf" style="padding:6px"/>
     </div>`,
    async () => {
      const fileInput = document.getElementById('ur-file') as HTMLInputElement | null;
      const file = fileInput?.files?.[0] ?? null;
      if (!file) { toast('Please select a file', 'error'); return; }
      const uploaded = await uploadReceiptFile(file);
      if (!uploaded) return;
      await deleteReceiptFile(b.receipt_url);
      const ok = await updateBill(id, { receipt_url: uploaded });
      if (!ok) { toast('Could not save receipt link', 'error'); return; }
      toast('Receipt uploaded ✓', 'success');
      closeModal();
      loadFinance();
    },
    'Upload',
  );
}

export async function submitBillForApproval(id: number) {
  if (!confirm('Submit this expense for approval?')) return;
  const ok = await updateBill(id, { status: 'For Approval' });
  if (!ok) { toast('Could not submit for approval', 'error'); return; }
  toast('Expense submitted for approval', 'success');
  loadFinance();
}

export function approveBill(id: number) {
  const b = _bills.find(x => x.id === id);
  if (!b) return;
  _approvingBillId = id;
  openModal('Approve Expense', `
    <div style="margin-bottom:14px;font-size:13px;color:var(--ink-2)">
      Approving expense from <strong>${escapeHtml(b.vendor ?? b.payee)}</strong><br>
      <span style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:700;color:var(--ink)">${formatCurrency(b.amount)}</span>
    </div>
    <div class="form-grid">
      <div class="form-group full">
        <div class="form-label">Approved By *</div>
        <input class="form-input" id="ap-approver" value="${escapeHtml(b.approved_by ?? '')}" placeholder="Name of approver"/>
      </div>
    </div>`, saveApproveBill, 'Approve');
}

export async function saveApproveBill() {
  if (!_approvingBillId) return;
  const approver = (document.getElementById('ap-approver') as HTMLInputElement).value.trim();
  if (!approver) { toast('Approver name is required', 'error'); return; }
  const ok = await updateBill(_approvingBillId, { status: 'Approved', approved_by: approver });
  if (!ok) { toast('Could not approve expense', 'error'); return; }
  toast('Expense approved', 'success');
  _approvingBillId = null;
  closeModal();
  loadFinance();
}

export async function rejectBill(id: number) {
  if (!confirm('Reject this expense and return it to Pending?')) return;
  const ok = await updateBill(id, { status: 'Pending' });
  if (!ok) { toast('Could not reject expense', 'error'); return; }
  toast('Expense returned to Pending', '');
  loadFinance();
}

export async function markBillPaid(id: number) {
  if (!confirm('Mark this expense as Paid?')) return;
  const ok = await updateBill(id, { status: 'Paid' });
  if (!ok) { toast('Could not mark as paid', 'error'); return; }
  toast('Expense marked as Paid', 'success');
  loadFinance();
}

export async function archiveBill(id: number) {
  if (!confirm('Archive this expense? It will be hidden from the main view.')) return;
  const ok = await updateBill(id, { archived_at: new Date().toISOString() } as Partial<Bill>);
  if (!ok) { toast('Could not archive expense', 'error'); return; }
  toast('Expense archived', '');
  loadFinance();
}

export async function handleDeleteBill(id: number) {
  if (!confirm('Delete this expense? This cannot be undone.')) return;
  const ok = await deleteBill(id);
  if (!ok) { toast('Could not delete expense', 'error'); return; }
  toast('Expense deleted', '');
  loadFinance();
}

export function printExpenseVoucher(id: number) {
  const b = _bills.find(x => x.id === id);
  if (!b) return;
  const { company } = APP_SETTINGS;
  const ewtRate = b.ewt && b.ewt !== '0%' ? parseFloat(b.ewt) / 100 : 0;
  const ewtAmt  = b.amount * ewtRate;
  const netPay  = b.amount - ewtAmt;
  const proj    = _projects.find(p => p.id === b.project_id);
  const w       = window.open('', '_blank', 'width=900,height=700');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Expense Voucher ${escapeHtml(b.expense_number ?? String(b.id))}</title>
<style>
  body{font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;background:#fff;padding:48px}
  .brand{font-size:26px;font-weight:700;letter-spacing:-0.5px}
  .brand span{font-weight:300;color:#666}
  .tagline{font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#888;margin-top:3px}
  .ev-title{font-size:22px;font-weight:600;color:#999;text-align:right}
  .ev-num{font-size:28px;font-weight:700;text-align:right;letter-spacing:-0.5px}
  .label{font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#888;margin-bottom:3px}
  .value{font-size:13px;color:#1a1a1a;margin-bottom:12px}
  .divider{border:none;border-top:1px solid #e8e3da;margin:20px 0}
  .total-row{display:flex;justify-content:space-between;font-size:13px;padding:4px 0}
  .total-final{font-size:20px;font-weight:700;border-top:2px solid #1a1a1a;padding-top:10px;margin-top:8px;display:flex;justify-content:space-between}
  .sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:48px;margin-top:48px}
  .sig-line{border-top:1px solid #1a1a1a;padding-top:8px;font-size:11px;color:#888;margin-top:48px}
  .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase}
  .badge-paid{background:#d4f5e2;color:#1a7a45}
  .badge-approved{background:#dbeafe;color:#1d4ed8}
  .badge-for-approval{background:#fef3c7;color:#92400e}
  .badge-pending{background:#f3f4f6;color:#6b7280}
  .badge-cancelled{background:#f3f4f6;color:#9ca3af}
  .footer{margin-top:48px;padding-top:18px;border-top:1px solid #e8e3da;font-size:10px;color:#aaa;text-align:center;line-height:1.8}
  @media print{body{padding:24px}.no-print{display:none}}
</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px">
  <div>
    <div class="brand">destine<span>vents</span></div>
    <div class="tagline">${escapeHtml(company.name)}</div>
    <div style="font-size:11px;color:#888;margin-top:8px;line-height:1.7">${escapeHtml(company.address)}</div>
  </div>
  <div>
    <div class="ev-title">Expense Voucher</div>
    <div class="ev-num">${escapeHtml(b.expense_number ?? `EXP-${b.id}`)}</div>
    <div style="text-align:right;margin-top:6px"><span class="badge badge-${AP_STATUS_CLASS[b.status] ?? 'pending'}">${escapeHtml(b.status)}</span></div>
  </div>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px">
  <div>
    <div class="label">Vendor</div>
    <div class="value" style="font-weight:600">${escapeHtml(b.vendor ?? b.payee)}</div>
    ${b.invoice_number ? `<div class="label">Vendor Invoice #</div><div class="value">${escapeHtml(b.invoice_number)}</div>` : ''}
    ${b.purchase_order ? `<div class="label">Purchase Order</div><div class="value">${escapeHtml(b.purchase_order)}</div>` : ''}
  </div>
  <div>
    <div class="label">Category</div>
    <div class="value">${escapeHtml(b.category ?? '—')}</div>
    <div class="label">Date</div>
    <div class="value">${displayDate(b.date)}</div>
    ${b.due_date ? `<div class="label">Due Date</div><div class="value">${displayDate(b.due_date)}</div>` : ''}
    ${proj ? `<div class="label">Project</div><div class="value">${escapeHtml(proj.name)}</div>` : ''}
  </div>
</div>

<hr class="divider"/>
<div style="max-width:400px;margin-left:auto">
  <div class="total-row"><span>Amount</span><span>${formatCurrency(b.amount)}</span></div>
  ${ewtAmt > 0 ? `<div class="total-row"><span>EWT Deduction (${escapeHtml(b.ewt)})</span><span style="color:#c0392b">− ${formatCurrency(ewtAmt)}</span></div>` : ''}
  <div class="total-final"><span>Net Payable</span><span>${formatCurrency(netPay)}</span></div>
</div>

${b.remarks ? `<hr class="divider"/><div class="label">Remarks</div><div class="value">${escapeHtml(b.remarks)}</div>` : ''}

<div class="sig-grid">
  <div>
    <div class="label">Prepared By</div>
    <div class="sig-line"></div>
    <div style="font-size:11px;color:#888;margin-top:6px">Signature / Name</div>
  </div>
  <div>
    <div class="label">Approved By</div>
    <div style="margin-top:${b.approved_by ? '12px' : '40px'};padding-top:8px;border-top:1px solid #1a1a1a;font-size:${b.approved_by ? '13px' : '11px'};color:${b.approved_by ? '#1a1a1a' : '#888'}">${b.approved_by ? escapeHtml(b.approved_by) : 'Signature / Name'}</div>
  </div>
</div>

<div class="footer no-print" style="margin-top:32px">
  <button onclick="window.print()" style="background:#252f27;color:#fff;border:none;padding:8px 22px;font-size:12px;cursor:pointer;font-family:inherit;letter-spacing:0.05em">Print / Save as PDF</button>
</div>
<div class="footer">
  Generated by DestineVents HQ · ${new Date().toLocaleDateString('en-PH', { year:'numeric', month:'long', day:'numeric' })}
</div>
</body></html>`);
  w.document.close();
}

// ── BIR ───────────────────────────────────────────────────────────────────────

function birBadgeClass(status: string) {
  return status === 'Filed'    ? 'paid'
       : status === 'Overdue'  ? 'overdue'
       : status === 'Due Soon' ? 'unpaid'
       : status === 'Ongoing'  ? 'lead'
       : 'lead';
}

function birHistoryLine(form: string) {
  const past = birFilingsFor(_birFilings, form) as BirFiling[];
  if (!past.length) return `<span style="color:var(--ink-3)">No filings recorded yet</span>`;
  const last = past[0];
  return `${escapeHtml(last.period)} — <span style="color:var(--green);font-weight:600">Filed ✓</span>`
       + ` <span style="color:var(--ink-3)">${formatDateShort(String(last.filed_at).slice(0, 10))}`
       + `${past.length > 1 ? ` · ${past.length} total` : ''}</span>`;
}

function birPeriodicCard(form: string, desc: string, period: string, deadlineISO: string | null, baseLabel: string, baseValue: number) {
  const filed  = birIsFiled(_birFilings, form, period);
  const status = birFilingStatus(deadlineISO, filed, new Date());
  const dline  = deadlineISO ? formatDateShort(deadlineISO) : '—';
  return `
    <div class="bir-card">
      <div class="bir-form-name">${form}</div>
      <div class="bir-form-desc">${desc}</div>
      <div class="flex-between">
        <div class="bir-deadline">${escapeHtml(period)} deadline: <strong>${dline}</strong></div>
        <span class="badge badge-${birBadgeClass(status)}">${status}</span>
      </div>
      <div style="margin-top:8px;font-size:11px;color:var(--ink-2)">${escapeHtml(baseLabel)}: <strong>${formatCurrency(baseValue)}</strong></div>
      <div style="margin-top:10px;font-size:11px;color:var(--ink-3)">${birHistoryLine(form)}</div>
      ${filed ? '' : `<button class="btn btn-primary" style="margin-top:12px;width:100%" onclick="openFileBir('${form}')">Save Filing Record</button>`}
    </div>`;
}

export function renderBIR() {
  const today = new Date();
  const { q, year } = birMostRecentCompletedQuarter(today);
  const period = birQuarterLabel(q, year);

  const receipts = birGrossReceipts(_invoices, q, year);
  const expenses = birExpenses(_bills, q, year);
  const netInc   = Math.max(0, receipts - expenses);
  const withheld = birCompWithholding(_payroll, APP_SETTINGS.finance.birYear);

  const twoThreeOhSeven = bir2307Bills(_bills) as Bill[];
  const last2307 = twoThreeOhSeven
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];

  gEl('bir-cards').innerHTML = `
    ${birPeriodicCard('2551Q', 'Quarterly Percentage Tax Return<br>Non-VAT · 3% of gross receipts',
        period, bir2551qDeadline(q, year), 'Gross receipts this quarter', receipts)}
    ${birPeriodicCard('1701Q', 'Quarterly Income Tax Return<br>For self-employed / OPC founders',
        period, bir1701qDeadline(q, year), 'Net income this quarter', netInc)}
    ${birPeriodicCard('1604C', 'Annual Information Return — Income Taxes Withheld on Compensation',
        `FY ${APP_SETTINGS.finance.birYear}`, bir1604cDeadline(APP_SETTINGS.finance.birYear),
        'Compensation withheld YTD', withheld)}
    <div class="bir-card">
      <div class="bir-form-name">2307</div>
      <div class="bir-form-desc">Certificate of Creditable Tax Withheld at Source — issue to payees per transaction</div>
      <div class="flex-between">
        <div class="bir-deadline">${twoThreeOhSeven.length} bill${twoThreeOhSeven.length !== 1 ? 's' : ''} with EWT to certify</div>
        <span class="badge badge-lead">Ongoing</span>
      </div>
      <div style="margin-top:10px;font-size:11px;color:var(--ink-3)">Last EWT bill: <span style="color:var(--ink);font-weight:600">${last2307 ? formatDateShort(String(last2307.date).slice(0, 10)) : '—'}</span></div>
    </div>`;
}

export function openFileBir(form: string) {
  const today  = new Date();
  const { q, year } = birMostRecentCompletedQuarter(today);
  const birYear = APP_SETTINGS.finance.birYear;

  let period: string, base: number, suggestedTax: number, baseLabel: string, note: string;
  if (form === '2551Q') {
    period = birQuarterLabel(q, year);
    base = birGrossReceipts(_invoices, q, year);
    suggestedTax = Math.round(base * BIR_PERCENTAGE_TAX_RATE * 100) / 100;
    baseLabel = 'Gross receipts (₱)';
    note = '3% percentage tax pre-filled from paid invoices this quarter.';
  } else if (form === '1701Q') {
    period = birQuarterLabel(q, year);
    base = Math.max(0, birGrossReceipts(_invoices, q, year) - birExpenses(_bills, q, year));
    suggestedTax = Math.round(birGrossReceipts(_invoices, q, year) * BIR_8PCT_OPTION_RATE * 100) / 100;
    baseLabel = 'Net income (₱)';
    note = '8% option pre-filled on gross receipts — verify against your accountant (graduated rates may apply).';
  } else {
    period = `FY ${birYear}`;
    base = birCompWithholding(_payroll, birYear);
    suggestedTax = base;
    baseLabel = 'Compensation withheld (₱)';
    note = 'Total withholding on compensation from payroll runs this year.';
  }

  openModal(`File ${form} — ${period}`, `
    <div class="form-grid">
      <div class="form-group"><div class="form-label">Form</div><input class="form-input" id="bir-form" value="${form}" readonly/></div>
      <div class="form-group"><div class="form-label">Period</div><input class="form-input" id="bir-period" value="${escapeHtml(period)}"/></div>
      <div class="form-group"><div class="form-label">${baseLabel}</div><input class="form-input" id="bir-base" type="number" value="${base}"/></div>
      <div class="form-group"><div class="form-label">Tax Due / Paid (₱)</div><input class="form-input" id="bir-tax" type="number" value="${suggestedTax}"/></div>
      <div class="form-group"><div class="form-label">Filed Date</div><input class="form-input" id="bir-date" type="date" value="${todayISO()}"/></div>
      <div class="form-group"><div class="form-label">BIR Reference No.</div><input class="form-input" id="bir-ref" placeholder="eFPS / confirmation no."/></div>
      <div class="form-group full"><div class="form-label">Notes</div><textarea class="form-input" id="bir-notes" rows="2" placeholder="Optional"></textarea></div>
    </div>
    <div style="font-size:10.5px;color:var(--ink-3);margin-top:10px;line-height:1.6">${note}</div>`, saveBirFiling);
}

export async function saveBirFiling() {
  const form   = gVal('bir-form').trim();
  const period = gVal('bir-period').trim();
  const err = validateRequired(period, 'Period');
  if (err) { toast(err, 'error'); return; }
  const result = await createBirFiling({
    form,
    period,
    tax_base:     +gVal('bir-base')  || 0,
    tax_due:      +gVal('bir-tax')   || 0,
    reference_no: gVal('bir-ref').trim(),
    notes:        gVal('bir-notes').trim(),
    filed_at:     gVal('bir-date') || todayISO(),
  });
  if (!result) { toast('Could not record BIR filing. Please try again.', 'error'); return; }
  toast(`${form} filing recorded for ${period}`, 'success');
  closeModal();
  loadFinance();
}

// ── BIR Tab Switcher ──────────────────────────────────────────────────────────

export function showBIRTab(name: string, el: HTMLElement) {
  document.querySelectorAll('#bir-subtabs .sub-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const tracker = document.getElementById('bir-panel-tracker');
  const reports  = document.getElementById('bir-panel-reports');
  if (tracker) tracker.style.display = name === 'tracker' ? '' : 'none';
  if (reports)  reports.style.display = name === 'reports'  ? '' : 'none';
  if (name === 'reports') renderBIRReports();
}

// ── BIR Reports ───────────────────────────────────────────────────────────────

type BIRReportState = {
  period:  'monthly' | 'quarterly' | 'annual';
  year:    number;
  month:   number;
  quarter: number;
};

let _birReport: BIRReportState = {
  period:  'monthly',
  year:    new Date().getFullYear(),
  month:   new Date().getMonth() + 1,
  quarter: Math.ceil((new Date().getMonth() + 1) / 3),
};

export function setBIRReportPeriod(val: string) {
  _birReport = { ..._birReport, period: val as BIRReportState['period'] };
  renderBIRReports();
}

export function setBIRReportYear(val: string) {
  _birReport = { ..._birReport, year: +val || new Date().getFullYear() };
  renderBIRReports();
}

export function setBIRReportMonth(val: string) {
  _birReport = { ..._birReport, month: +val || 1 };
  renderBIRReports();
}

export function setBIRReportQuarter(val: string) {
  _birReport = { ..._birReport, quarter: +val || 1 };
  renderBIRReports();
}

function _birReportInvoices() {
  const paid = _invoices.filter(i => i.status === 'Paid' && !i.archived_at);
  const year = _birReport.year;
  if (_birReport.period === 'annual') {
    return paid.filter(i => (i.payment_date ?? i.date ?? '').slice(0, 4) === String(year));
  }
  if (_birReport.period === 'quarterly') {
    const qMonths = [1, 2, 3].map(m => m + (_birReport.quarter - 1) * 3);
    return paid.filter(i => {
      const d = i.payment_date ?? i.date ?? '';
      return d.slice(0, 4) === String(year) && qMonths.includes(+d.slice(5, 7));
    });
  }
  const mm = String(_birReport.month).padStart(2, '0');
  return paid.filter(i => (i.payment_date ?? i.date ?? '').slice(0, 7) === `${year}-${mm}`);
}

function _birReportBills() {
  const paid = _bills.filter(b => b.status === 'Paid' && !b.archived_at);
  const year = _birReport.year;
  if (_birReport.period === 'annual') {
    return paid.filter(b => (b.date ?? '').slice(0, 4) === String(year));
  }
  if (_birReport.period === 'quarterly') {
    const qMonths = [1, 2, 3].map(m => m + (_birReport.quarter - 1) * 3);
    return paid.filter(b => {
      const d = b.date ?? '';
      return d.slice(0, 4) === String(year) && qMonths.includes(+d.slice(5, 7));
    });
  }
  const mm = String(_birReport.month).padStart(2, '0');
  return paid.filter(b => (b.date ?? '').slice(0, 7) === `${year}-${mm}`);
}

function _periodLabel() {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (_birReport.period === 'annual')   return `FY ${_birReport.year}`;
  if (_birReport.period === 'quarterly') return `Q${_birReport.quarter} ${_birReport.year}`;
  return `${MONTHS[_birReport.month - 1]} ${_birReport.year}`;
}

export function renderBIRReports() {
  const el = document.getElementById('bir-reports-content');
  if (!el) return;

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const curYear = new Date().getFullYear();
  const yearOpts = Array.from({ length: 5 }, (_, i) => curYear - i)
    .map(y => `<option value="${y}"${y === _birReport.year ? ' selected' : ''}>${y}</option>`).join('');
  const monthOpts = MONTHS.map((m, i) =>
    `<option value="${i + 1}"${i + 1 === _birReport.month ? ' selected' : ''}>${m}</option>`).join('');
  const qOpts = [1,2,3,4].map(q =>
    `<option value="${q}"${q === _birReport.quarter ? ' selected' : ''}>Q${q}</option>`).join('');

  const invs  = _birReportInvoices();
  const bills = _birReportBills();

  const totalRevenue  = invs.reduce((s, i) => s + (i.amount || 0), 0);
  const totalExpenses = bills.reduce((s, b) => s + (b.amount || 0), 0);
  const netIncome     = totalRevenue - totalExpenses;

  // Revenue by client
  const byClient: Record<string, number> = {};
  invs.forEach(i => { byClient[i.client ?? 'Unknown'] = (byClient[i.client ?? 'Unknown'] || 0) + (i.amount || 0); });
  const clientRows = Object.entries(byClient).sort((a, b) => b[1] - a[1]);

  // Expenses by category
  const byCat: Record<string, number> = {};
  bills.forEach(b => { byCat[b.category ?? 'Uncategorized'] = (byCat[b.category ?? 'Uncategorized'] || 0) + (b.amount || 0); });
  const catRows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  // VAT Summary — Output VAT (12% on gross receipts) vs Input VAT (EWT withheld on bills)
  const outputVat  = Math.round(totalRevenue / 1.12 * 0.12 * 100) / 100;
  const inputEwt   = bills.reduce((s, b) => {
    const rate = parseFloat((b.ewt ?? '0%').replace('%', '')) / 100;
    return s + Math.round(b.amount * rate * 100) / 100;
  }, 0);
  const vatPayable = outputVat - inputEwt;

  // Monthly breakdown (last 6 months for annual/quarterly views, or just current month)
  const last6 = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(curYear, new Date().getMonth() - (5 - i), 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: MONTHS[d.getMonth()] };
  });
  const revByMonth = Object.fromEntries(last6.map(m => [m.key, 0]));
  const expByMonth = Object.fromEntries(last6.map(m => [m.key, 0]));
  _invoices.filter(i => i.status === 'Paid').forEach(i => {
    const k = (i.payment_date ?? i.date ?? '').slice(0, 7);
    if (k in revByMonth) revByMonth[k] += i.amount || 0;
  });
  _bills.filter(b => b.status === 'Paid').forEach(b => {
    const k = (b.date ?? '').slice(0, 7);
    if (k in expByMonth) expByMonth[k] += b.amount || 0;
  });
  const maxBar = Math.max(...last6.map(m => Math.max(revByMonth[m.key], expByMonth[m.key])), 1);

  el.innerHTML = `
    <!-- Period Selector -->
    <div class="card" style="padding:14px 16px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3)">Period</div>
        <select class="form-input" style="width:auto;padding:4px 10px;height:30px;font-size:12px" onchange="setBIRReportPeriod(this.value)">
          <option value="monthly"${_birReport.period==='monthly' ? ' selected' : ''}>Monthly</option>
          <option value="quarterly"${_birReport.period==='quarterly' ? ' selected' : ''}>Quarterly</option>
          <option value="annual"${_birReport.period==='annual' ? ' selected' : ''}>Annual</option>
        </select>
        <select class="form-input" style="width:auto;padding:4px 10px;height:30px;font-size:12px" onchange="setBIRReportYear(this.value)">${yearOpts}</select>
        ${_birReport.period === 'monthly'   ? `<select class="form-input" style="width:auto;padding:4px 10px;height:30px;font-size:12px" onchange="setBIRReportMonth(this.value)">${monthOpts}</select>` : ''}
        ${_birReport.period === 'quarterly' ? `<select class="form-input" style="width:auto;padding:4px 10px;height:30px;font-size:12px" onchange="setBIRReportQuarter(this.value)">${qOpts}</select>` : ''}
        <div style="margin-left:auto;display:flex;gap:8px">
          <button class="btn btn-ghost" style="font-size:11px;padding:4px 12px" onclick="printBIRReport()">Print / PDF</button>
          <button class="btn btn-ghost" style="font-size:11px;padding:4px 12px" onclick="exportBIRReportExcel()">Export Excel</button>
          <button class="btn btn-ghost" style="font-size:11px;padding:4px 12px" onclick="exportBIRReportCSV()">Export CSV</button>
        </div>
      </div>
    </div>

    <!-- Summary Cards -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">Total Revenue</div>
        <div class="stat-value" style="font-size:20px;color:var(--green)">${formatCurrency(totalRevenue)}</div>
        <div class="stat-change up">${invs.length} paid invoice${invs.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Expenses</div>
        <div class="stat-value" style="font-size:20px;color:var(--red)">${formatCurrency(totalExpenses)}</div>
        <div class="stat-change">${bills.length} expense${bills.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Net Income</div>
        <div class="stat-value" style="font-size:20px;${netIncome < 0 ? 'color:var(--red)' : 'color:var(--green)'}">${formatCurrency(Math.abs(netIncome))}</div>
        <div class="stat-change ${netIncome >= 0 ? 'up' : ''}">${netIncome >= 0 ? 'Profitable' : 'Operating at a loss'} · ${_periodLabel()}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      <!-- Revenue Summary -->
      <div class="card" style="padding:16px">
        <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:12px">Revenue Summary — ${_periodLabel()}</div>
        ${invs.length === 0
          ? '<div style="font-size:12px;color:var(--ink-3)">No paid invoices in this period</div>'
          : `<table style="width:100%;border-collapse:collapse;font-size:12px">
              <thead><tr>
                <th style="text-align:left;padding:4px 0;color:var(--ink-3);font-weight:600;border-bottom:1px solid var(--linen-3)">Date</th>
                <th style="text-align:left;padding:4px 0;color:var(--ink-3);font-weight:600;border-bottom:1px solid var(--linen-3)">Client</th>
                <th style="text-align:right;padding:4px 0;color:var(--ink-3);font-weight:600;border-bottom:1px solid var(--linen-3)">Amount</th>
              </tr></thead>
              <tbody>${invs.slice(0, 10).map(i => `
                <tr>
                  <td style="padding:5px 0;color:var(--ink-3)">${displayDate(i.payment_date ?? i.date)}</td>
                  <td style="padding:5px 0">${escapeHtml(i.client ?? '—')}</td>
                  <td style="padding:5px 0;text-align:right;font-family:'Cormorant Garamond',serif;font-weight:600">${formatCurrency(i.amount)}</td>
                </tr>`).join('')}
              </tbody>
              <tfoot><tr>
                <td colspan="2" style="padding:6px 0;font-weight:600;border-top:1px solid var(--linen-3)">Total${invs.length > 10 ? ` (${invs.length} invoices)` : ''}</td>
                <td style="padding:6px 0;text-align:right;font-family:'Cormorant Garamond',serif;font-weight:700;border-top:1px solid var(--linen-3);color:var(--green)">${formatCurrency(totalRevenue)}</td>
              </tr></tfoot>
            </table>`}
      </div>

      <!-- Expense Summary -->
      <div class="card" style="padding:16px">
        <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:12px">Expense Summary — ${_periodLabel()}</div>
        ${catRows.length === 0
          ? '<div style="font-size:12px;color:var(--ink-3)">No expenses in this period</div>'
          : `<table style="width:100%;border-collapse:collapse;font-size:12px">
              <thead><tr>
                <th style="text-align:left;padding:4px 0;color:var(--ink-3);font-weight:600;border-bottom:1px solid var(--linen-3)">Category</th>
                <th style="text-align:right;padding:4px 0;color:var(--ink-3);font-weight:600;border-bottom:1px solid var(--linen-3)">Amount</th>
                <th style="text-align:right;padding:4px 0;color:var(--ink-3);font-weight:600;border-bottom:1px solid var(--linen-3)">%</th>
              </tr></thead>
              <tbody>${catRows.map(([cat, amt]) => `
                <tr>
                  <td style="padding:5px 0">${escapeHtml(cat)}</td>
                  <td style="padding:5px 0;text-align:right;font-family:'Cormorant Garamond',serif;font-weight:600">${formatCurrency(amt)}</td>
                  <td style="padding:5px 0;text-align:right;color:var(--ink-3)">${totalExpenses > 0 ? Math.round(amt / totalExpenses * 100) : 0}%</td>
                </tr>`).join('')}
              </tbody>
              <tfoot><tr>
                <td style="padding:6px 0;font-weight:600;border-top:1px solid var(--linen-3)">Total</td>
                <td style="padding:6px 0;text-align:right;font-family:'Cormorant Garamond',serif;font-weight:700;border-top:1px solid var(--linen-3);color:var(--red)">${formatCurrency(totalExpenses)}</td>
                <td style="border-top:1px solid var(--linen-3)"></td>
              </tr></tfoot>
            </table>`}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      <!-- Sales Report -->
      <div class="card" style="padding:16px">
        <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:12px">Sales Report by Client — ${_periodLabel()}</div>
        ${clientRows.length === 0
          ? '<div style="font-size:12px;color:var(--ink-3)">No sales in this period</div>'
          : `<table style="width:100%;border-collapse:collapse;font-size:12px">
              <thead><tr>
                <th style="text-align:left;padding:4px 0;color:var(--ink-3);font-weight:600;border-bottom:1px solid var(--linen-3)">Client</th>
                <th style="text-align:right;padding:4px 0;color:var(--ink-3);font-weight:600;border-bottom:1px solid var(--linen-3)">Revenue</th>
                <th style="text-align:right;padding:4px 0;color:var(--ink-3);font-weight:600;border-bottom:1px solid var(--linen-3)">Share</th>
              </tr></thead>
              <tbody>${clientRows.map(([client, amt]) => `
                <tr>
                  <td style="padding:5px 0">${escapeHtml(client)}</td>
                  <td style="padding:5px 0;text-align:right;font-family:'Cormorant Garamond',serif;font-weight:600">${formatCurrency(amt)}</td>
                  <td style="padding:5px 0;text-align:right;color:var(--ink-3)">${totalRevenue > 0 ? Math.round(amt / totalRevenue * 100) : 0}%</td>
                </tr>`).join('')}
              </tbody>
              <tfoot><tr>
                <td style="padding:6px 0;font-weight:600;border-top:1px solid var(--linen-3)">Total</td>
                <td style="padding:6px 0;text-align:right;font-family:'Cormorant Garamond',serif;font-weight:700;border-top:1px solid var(--linen-3);color:var(--green)">${formatCurrency(totalRevenue)}</td>
                <td style="border-top:1px solid var(--linen-3)"></td>
              </tr></tfoot>
            </table>`}
      </div>

      <!-- VAT Summary -->
      <div class="card" style="padding:16px">
        <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:12px">VAT / Tax Summary — ${_periodLabel()}</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <tbody>
            <tr style="border-bottom:1px solid var(--linen-3)">
              <td style="padding:8px 0;color:var(--ink-2)">Gross Receipts (Revenue)</td>
              <td style="padding:8px 0;text-align:right;font-family:'Cormorant Garamond',serif;font-weight:600">${formatCurrency(totalRevenue)}</td>
            </tr>
            <tr style="border-bottom:1px solid var(--linen-3)">
              <td style="padding:8px 0;color:var(--ink-2)">Output VAT (12% on gross)</td>
              <td style="padding:8px 0;text-align:right;font-family:'Cormorant Garamond',serif;font-weight:600;color:var(--amber)">${formatCurrency(outputVat)}</td>
            </tr>
            <tr style="border-bottom:1px solid var(--linen-3)">
              <td style="padding:8px 0;color:var(--ink-2)">Total Expenses</td>
              <td style="padding:8px 0;text-align:right;font-family:'Cormorant Garamond',serif;font-weight:600">${formatCurrency(totalExpenses)}</td>
            </tr>
            <tr style="border-bottom:1px solid var(--linen-3)">
              <td style="padding:8px 0;color:var(--ink-2)">Input Tax / EWT Withheld</td>
              <td style="padding:8px 0;text-align:right;font-family:'Cormorant Garamond',serif;font-weight:600;color:var(--green)">− ${formatCurrency(inputEwt)}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;font-weight:700">Net VAT Payable</td>
              <td style="padding:10px 0;text-align:right;font-family:'Cormorant Garamond',serif;font-weight:700;font-size:16px;${vatPayable > 0 ? 'color:var(--red)' : 'color:var(--green)'}">${formatCurrency(Math.abs(vatPayable))}</td>
            </tr>
          </tbody>
        </table>
        <div style="margin-top:12px;font-size:10.5px;color:var(--ink-3);line-height:1.6">
          Output VAT computed at 12% of gross receipts. Input tax reflects EWT withheld on expense vouchers. Consult your accountant for BIR filing.
        </div>
      </div>
    </div>

    <!-- Monthly Trend (last 6 months) -->
    <div class="card" style="padding:16px;margin-bottom:16px">
      <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:12px">Revenue vs Expenses — Last 6 Months</div>
      <div style="display:flex;align-items:flex-end;gap:8px;height:90px">
        ${last6.map(m => `
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">
            <div style="display:flex;align-items:flex-end;gap:3px;height:72px">
              <div title="Revenue ${formatCurrency(revByMonth[m.key])}" style="width:12px;background:var(--gold);height:${Math.max(2, Math.round(revByMonth[m.key] / maxBar * 72))}px;border-radius:2px 2px 0 0"></div>
              <div title="Expenses ${formatCurrency(expByMonth[m.key])}" style="width:12px;background:var(--linen-3);height:${Math.max(2, Math.round(expByMonth[m.key] / maxBar * 72))}px;border-radius:2px 2px 0 0"></div>
            </div>
            <div style="font-size:9px;color:var(--ink-3)">${m.label}</div>
          </div>`).join('')}
      </div>
      <div style="display:flex;gap:12px;margin-top:8px">
        <div style="display:flex;align-items:center;gap:4px"><div style="width:8px;height:8px;background:var(--gold);border-radius:2px"></div><span style="font-size:10px;color:var(--ink-3)">Revenue</span></div>
        <div style="display:flex;align-items:center;gap:4px"><div style="width:8px;height:8px;background:var(--linen-3);border-radius:2px"></div><span style="font-size:10px;color:var(--ink-3)">Expenses</span></div>
      </div>
    </div>`;
}

// ── BIR Report Exports ────────────────────────────────────────────────────────

export function printBIRReport() {
  const company = APP_SETTINGS.company;
  const invs    = _birReportInvoices();
  const bills   = _birReportBills();
  const period  = _periodLabel();

  const totalRevenue  = invs.reduce((s, i)  => s + (i.amount || 0), 0);
  const totalExpenses = bills.reduce((s, b) => s + (b.amount || 0), 0);
  const netIncome     = totalRevenue - totalExpenses;
  const outputVat     = Math.round(totalRevenue / 1.12 * 0.12 * 100) / 100;
  const inputEwt      = bills.reduce((s, b) => {
    const rate = parseFloat((b.ewt ?? '0%').replace('%', '')) / 100;
    return s + Math.round(b.amount * rate * 100) / 100;
  }, 0);

  const byClient: Record<string, number> = {};
  invs.forEach(i => { byClient[i.client ?? 'Unknown'] = (byClient[i.client ?? 'Unknown'] || 0) + (i.amount || 0); });
  const byCat: Record<string, number> = {};
  bills.forEach(b => { byCat[b.category ?? 'Uncategorized'] = (byCat[b.category ?? 'Uncategorized'] || 0) + (b.amount || 0); });

  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) { toast('Pop-up blocked — allow pop-ups and try again', 'error'); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>BIR Report — ${escapeHtml(period)}</title>
<style>
  body{font-family:Georgia,serif;font-size:13px;color:#1a1a1a;padding:40px;max-width:800px;margin:0 auto}
  h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;font-weight:700;margin:24px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px}
  th{text-align:left;padding:5px 6px;border-bottom:2px solid #1a1a1a;font-size:11px;letter-spacing:.05em}
  td{padding:5px 6px;border-bottom:1px solid #eee}
  .right{text-align:right}.total{font-weight:700;border-top:2px solid #1a1a1a}
  .summary{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:24px}
  .card{border:1px solid #ddd;padding:12px;border-radius:4px}.label{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#666}
  .value{font-size:20px;font-weight:700;margin-top:4px}
  @media print{button{display:none}}
</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px">
  <div>
    <h1>${escapeHtml(company.name)}</h1>
    <div style="font-size:11px;color:#666">${escapeHtml(company.address ?? '')} · TIN: ${escapeHtml((APP_SETTINGS as any).tin ?? '—')}</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:18px;font-weight:700">BIR Financial Report</div>
    <div style="font-size:13px;color:#666">${escapeHtml(period)}</div>
    <div style="font-size:11px;color:#999">Generated ${new Date().toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric'})}</div>
  </div>
</div>

<div class="summary">
  <div class="card"><div class="label">Total Revenue</div><div class="value" style="color:#1a6b3c">${formatCurrency(totalRevenue)}</div></div>
  <div class="card"><div class="label">Total Expenses</div><div class="value" style="color:#c0392b">${formatCurrency(totalExpenses)}</div></div>
  <div class="card"><div class="label">Net Income</div><div class="value" style="${netIncome<0?'color:#c0392b':'color:#1a6b3c'}">${formatCurrency(Math.abs(netIncome))}</div></div>
</div>

<h2>Revenue Summary</h2>
<table><thead><tr><th>Date</th><th>Client</th><th>Invoice #</th><th class="right">Amount</th></tr></thead>
<tbody>${invs.map(i => `<tr><td>${displayDate(i.payment_date ?? i.date)}</td><td>${escapeHtml(i.client ?? '—')}</td><td>${escapeHtml(i.or_num ?? '—')}</td><td class="right">${formatCurrency(i.amount)}</td></tr>`).join('')}</tbody>
<tfoot><tr class="total"><td colspan="3">Total Revenue</td><td class="right">${formatCurrency(totalRevenue)}</td></tr></tfoot>
</table>

<h2>Expense Summary by Category</h2>
<table><thead><tr><th>Category</th><th class="right">Amount</th><th class="right">%</th></tr></thead>
<tbody>${Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>`<tr><td>${escapeHtml(cat)}</td><td class="right">${formatCurrency(amt)}</td><td class="right">${totalExpenses>0?Math.round(amt/totalExpenses*100):0}%</td></tr>`).join('')}</tbody>
<tfoot><tr class="total"><td>Total Expenses</td><td class="right">${formatCurrency(totalExpenses)}</td><td></td></tr></tfoot>
</table>

<h2>Sales Report by Client</h2>
<table><thead><tr><th>Client</th><th class="right">Revenue</th><th class="right">Share</th></tr></thead>
<tbody>${Object.entries(byClient).sort((a,b)=>b[1]-a[1]).map(([client,amt])=>`<tr><td>${escapeHtml(client)}</td><td class="right">${formatCurrency(amt)}</td><td class="right">${totalRevenue>0?Math.round(amt/totalRevenue*100):0}%</td></tr>`).join('')}</tbody>
<tfoot><tr class="total"><td>Total</td><td class="right">${formatCurrency(totalRevenue)}</td><td></td></tr></tfoot>
</table>

<h2>VAT / Tax Summary</h2>
<table><tbody>
  <tr><td>Gross Receipts</td><td class="right">${formatCurrency(totalRevenue)}</td></tr>
  <tr><td>Output VAT (12%)</td><td class="right">${formatCurrency(outputVat)}</td></tr>
  <tr><td>Input Tax / EWT Withheld</td><td class="right">− ${formatCurrency(inputEwt)}</td></tr>
  <tr class="total"><td>Net VAT Payable</td><td class="right">${formatCurrency(Math.abs(outputVat - inputEwt))}</td></tr>
</tbody></table>

<div style="margin-top:40px;font-size:10px;color:#999;border-top:1px solid #eee;padding-top:12px">
  This report is for internal reference only. Consult your accountant before filing with BIR. Generated by DestineVents HQ.
</div>
<div style="margin-top:20px;text-align:center"><button onclick="window.print()" style="background:#252f27;color:#fff;border:none;padding:8px 24px;font-size:12px;cursor:pointer;font-family:inherit">Print / Save as PDF</button></div>
</body></html>`);
  w.document.close();
}

export function exportBIRReportCSV() {
  const invs  = _birReportInvoices();
  const bills = _birReportBills();
  const period = _periodLabel();

  const rows: string[][] = [];

  rows.push([`BIR Financial Report — ${period}`]);
  rows.push([]);
  rows.push(['=== REVENUE SUMMARY ===']);
  rows.push(['Date', 'Client', 'Invoice #', 'Amount']);
  invs.forEach(i => rows.push([
    String(i.payment_date ?? i.date ?? ''),
    String(i.client ?? ''),
    String(i.or_num ?? ''),
    String(i.amount ?? 0),
  ]));
  rows.push(['', '', 'TOTAL REVENUE', String(invs.reduce((s, i) => s + (i.amount || 0), 0))]);

  rows.push([]);
  rows.push(['=== EXPENSE SUMMARY ===']);
  rows.push(['Date', 'Vendor', 'Category', 'Amount', 'EWT Rate']);
  bills.forEach(b => rows.push([
    String(b.date ?? ''),
    String(b.vendor ?? b.payee ?? ''),
    String(b.category ?? ''),
    String(b.amount ?? 0),
    String(b.ewt ?? '0%'),
  ]));
  rows.push(['', '', '', 'TOTAL EXPENSES', String(bills.reduce((s, b) => s + (b.amount || 0), 0))]);

  rows.push([]);
  rows.push(['=== VAT SUMMARY ===']);
  const rev = invs.reduce((s, i) => s + (i.amount || 0), 0);
  const ewt = bills.reduce((s, b) => {
    const rate = parseFloat((b.ewt ?? '0%').replace('%', '')) / 100;
    return s + Math.round(b.amount * rate * 100) / 100;
  }, 0);
  rows.push(['Gross Receipts', String(rev)]);
  rows.push(['Output VAT (12%)', String(Math.round(rev / 1.12 * 0.12 * 100) / 100)]);
  rows.push(['Input Tax / EWT', String(ewt)]);
  rows.push(['Net VAT Payable', String(Math.round((rev / 1.12 * 0.12 - ewt) * 100) / 100)]);

  const csv   = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob  = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href      = url;
  a.download  = `BIR-Report-${period.replace(/\s/g, '-')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('CSV exported', 'success');
}

export function exportBIRReportExcel() {
  const invs   = _birReportInvoices();
  const bills  = _birReportBills();
  const period = _periodLabel();

  const totalRevenue  = invs.reduce((s, i) => s + (i.amount || 0), 0);
  const totalExpenses = bills.reduce((s, b) => s + (b.amount || 0), 0);
  const netIncome     = totalRevenue - totalExpenses;
  const outputVat     = Math.round(totalRevenue / 1.12 * 0.12 * 100) / 100;
  const inputEwt      = bills.reduce((s, b) => {
    const rate = parseFloat((b.ewt ?? '0%').replace('%', '')) / 100;
    return s + Math.round(b.amount * rate * 100) / 100;
  }, 0);
  const byCat: Record<string, number> = {};
  bills.forEach(b => { byCat[b.category ?? 'Uncategorized'] = (byCat[b.category ?? 'Uncategorized'] || 0) + (b.amount || 0); });
  const byClient: Record<string, number> = {};
  invs.forEach(i => { byClient[i.client ?? 'Unknown'] = (byClient[i.client ?? 'Unknown'] || 0) + (i.amount || 0); });

  const cell = (v: string | number, bold = false, right = false) =>
    `<td style="${bold ? 'font-weight:700;' : ''}${right ? 'text-align:right;mso-number-format:"#,##0.00";' : ''}">${escapeHtml(String(v))}</td>`;
  const th = (v: string) => `<th style="background:#f5f0e8;font-weight:700;border:1px solid #ccc;padding:4px 8px">${escapeHtml(v)}</th>`;
  const tr = (...cells: string[]) => `<tr style="border:1px solid #ddd">${cells.join('')}</tr>`;
  const heading = (v: string) =>
    `<tr><td colspan="4" style="background:#252f27;color:#fff;font-weight:700;font-size:13px;padding:6px 8px">${escapeHtml(v)}</td></tr>`;

  const html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8"/>
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>
  <x:ExcelWorksheet><x:Name>BIR Report</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet>
</x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
</head><body>
<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;font-family:Arial;font-size:12px">
  <tr><td colspan="4" style="font-size:16px;font-weight:700;padding:8px">BIR Financial Report — ${escapeHtml(period)}</td></tr>
  <tr><td colspan="4" style="color:#666;font-size:11px">${escapeHtml(APP_SETTINGS.company.name)}</td></tr>
  <tr></tr>

  <!-- Summary -->
  ${heading('SUMMARY')}
  ${tr(cell('Total Revenue', true), cell(totalRevenue, false, true))}
  ${tr(cell('Total Expenses', true), cell(totalExpenses, false, true))}
  ${tr(cell('Net Income', true), cell(netIncome, true, true))}
  <tr></tr>

  <!-- Revenue Summary -->
  ${heading('REVENUE SUMMARY')}
  <tr>${th('Date')}${th('Client')}${th('Invoice #')}${th('Amount')}</tr>
  ${invs.map(i => tr(cell(String(i.payment_date ?? i.date ?? '')), cell(i.client ?? '—'), cell(i.or_num ?? '—'), cell(i.amount ?? 0, false, true))).join('')}
  ${tr(cell('TOTAL REVENUE', true), cell(''), cell(''), cell(totalRevenue, true, true))}
  <tr></tr>

  <!-- Expense Summary -->
  ${heading('EXPENSE SUMMARY BY CATEGORY')}
  <tr>${th('Category')}${th('Amount')}${th('%')}${th('')}</tr>
  ${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([cat, amt]) =>
    tr(cell(cat), cell(amt, false, true), cell(`${totalExpenses > 0 ? Math.round(amt / totalExpenses * 100) : 0}%`), cell(''))).join('')}
  ${tr(cell('TOTAL EXPENSES', true), cell(totalExpenses, true, true), cell(''), cell(''))}
  <tr></tr>

  <!-- Sales Report -->
  ${heading('SALES REPORT BY CLIENT')}
  <tr>${th('Client')}${th('Revenue')}${th('%')}${th('')}</tr>
  ${Object.entries(byClient).sort((a, b) => b[1] - a[1]).map(([client, amt]) =>
    tr(cell(client), cell(amt, false, true), cell(`${totalRevenue > 0 ? Math.round(amt / totalRevenue * 100) : 0}%`), cell(''))).join('')}
  ${tr(cell('TOTAL', true), cell(totalRevenue, true, true), cell(''), cell(''))}
  <tr></tr>

  <!-- VAT Summary -->
  ${heading('VAT / TAX SUMMARY')}
  ${tr(cell('Gross Receipts'), cell(totalRevenue, false, true))}
  ${tr(cell('Output VAT (12%)'), cell(outputVat, false, true))}
  ${tr(cell('Input Tax / EWT Withheld'), cell(inputEwt, false, true))}
  ${tr(cell('Net VAT Payable', true), cell(Math.abs(outputVat - inputEwt), true, true))}
</table>
</body></html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `BIR-Report-${period.replace(/\s/g, '-')}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Excel file exported', 'success');
}
