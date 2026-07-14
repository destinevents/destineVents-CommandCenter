import { formatCurrency } from '../../shared/utils/formatUtils.ts';
import { formatDateShort, todayISO } from '../../shared/utils/dateUtils.ts';
import { escapeHtml, statusClass } from '../../shared/utils/helpers.ts';
import { validateRequired } from '../../shared/utils/validators.ts';
import { APP_SETTINGS } from '../../config/settings.js';
import {
  fetchInvoices, createInvoice, updateInvoice, deleteInvoice,
  fetchBills, createBill, updateBill, deleteBill,
  fetchPayrollRuns, createPayrollRun, updatePayrollRun, deletePayrollRun,
  calcFinanceSummary, fetchLineItems, upsertLineItems,
} from '../../shared/services/financeService.ts';
import { fetchSOBs, updateSOB } from '../../shared/services/sobService.ts';
import { createInvoicePaymentLink } from '../../shared/services/paymentService.ts';
import { fetchClients } from '../../shared/services/clientService.ts';
import { fetchProjects } from '../../shared/services/projectService.ts';
import { fetchPartners } from '../../shared/services/partnerService.ts';
import { fetchBirFilings, createBirFiling } from '../../shared/services/birService.ts';
import { renderSOB } from './sob.ts';
import {
  BIR_PERCENTAGE_TAX_RATE, BIR_8PCT_OPTION_RATE, birMostRecentCompletedQuarter,
  birQuarterLabel, bir2551qDeadline, bir1701qDeadline, bir1604cDeadline,
  birFilingStatus, birGrossReceipts, birExpenses, birCompWithholding,
  bir2307Bills, birIsFiled, birFilingsFor,
} from '../../shared/business/birCalc.js';
import { _clients, _projects, _partners, _invoices, _bills, _payroll, _birFilings, _sobs, setClients, setProjects, setPartners, setInvoices, setBills, setPayroll, setBirFilings, setSOBs } from './state.ts';
import { toast, openModal, closeModal } from './ui.ts';
import type { Invoice, Bill, PayrollRun, BirFiling, InvoiceLineItem, SOB } from '../../shared/types.ts';

const gEl = (id: string) => document.getElementById(id)!;
const gVal = (id: string) => (document.getElementById(id) as HTMLInputElement).value;

let _editingInvoiceId: number | null  = null;
let _editingBillId: number | null     = null;
let _editingPayrollId: number | null  = null;
let _showArchivedInvoices             = false;
let _pendingSOBConvertId: number | null = null;

function lineItemRowHTML(item: Partial<InvoiceLineItem> = {}) {
  const lineTotal = (item.quantity ?? 1) * (item.unit_price ?? 0) * (1 + (item.vat_rate ?? 0) / 100);
  return `
    <tr class="li-row">
      <td style="padding:3px 4px"><input class="form-input li-desc" style="font-size:12px;padding:4px 6px" value="${escapeHtml(item.description || '')}" placeholder="Service / item" oninput="recalcInvoice()"/></td>
      <td style="padding:3px 4px"><input class="form-input li-qty" style="font-size:12px;padding:4px 6px;text-align:right" type="number" value="${item.quantity ?? 1}" min="0" step="any" oninput="recalcInvoice()"/></td>
      <td style="padding:3px 4px"><input class="form-input li-price" style="font-size:12px;padding:4px 6px;text-align:right" type="number" value="${item.unit_price ?? 0}" min="0" step="any" oninput="recalcInvoice()"/></td>
      <td style="padding:3px 4px"><input class="form-input li-vat" style="font-size:12px;padding:4px 6px;text-align:right" type="number" value="${item.vat_rate ?? 0}" min="0" max="100" step="any" oninput="recalcInvoice()"/></td>
      <td class="li-amt" style="padding:3px 4px;text-align:right;font-size:12px">${formatCurrency(lineTotal)}</td>
      <td style="padding:3px 4px"><button type="button" class="btn btn-ghost" style="padding:2px 6px;font-size:11px;color:var(--red)" onclick="this.closest('tr').remove();recalcInvoice()">×</button></td>
    </tr>`;
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
  renderFinanceOverview(_invoices, _bills);
  renderAR(_invoices);
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
    ..._payroll.filter(p => p.status === 'Released').map(p => ({
      text: `Payroll released — ${escapeHtml(p.period)}`,
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

// ── AR (Invoices) ─────────────────────────────────────────────────────────────

export function renderAR(invoices: Invoice[]) {
  const visible = _showArchivedInvoices
    ? invoices.filter(i => i.archived_at)
    : invoices.filter(i => !i.archived_at);
  const total   = visible.reduce((s, i) => s + i.amount, 0);
  const out     = visible.filter(i => i.status !== 'Paid').reduce((s, i) => s + i.amount, 0);
  const archivedCount = invoices.filter(i => i.archived_at).length;
  gEl('ar-summary').textContent =
    `${visible.length} invoice${visible.length !== 1 ? 's' : ''} · ${formatCurrency(total)} total · ${formatCurrency(out)} outstanding`;

  const toggleBtn = document.getElementById('ar-archive-toggle');
  if (toggleBtn) {
    toggleBtn.textContent = _showArchivedInvoices
      ? 'Hide Archived'
      : `Archived (${archivedCount})`;
  }

  gEl('ar-tbody').innerHTML = visible.length
    ? visible.map(i => {
        const isActive  = !['Paid', 'Cancelled'].includes(i.status);
        const isArchived = !!i.archived_at;
        const payLinkBtn = isActive && !isArchived
          ? i.payment_url
            ? `<a href="${escapeHtml(i.payment_url)}" target="_blank" rel="noopener" class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--gold)">Copy Link</a>`
            : `<button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--gold)" onclick="openPaymentLink(${i.id},${i.amount},'${escapeHtml(i.client ?? '')}','${escapeHtml(i.or_num)}')">Pay Link</button>`
          : '';
        const bpiBtn = isActive && !isArchived && APP_SETTINGS.banking.bpiQrImageUrl
          ? `<button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--ink-2)" onclick="openBpiQr(${i.id},${i.amount},'${escapeHtml(i.client ?? '')}')">BPI QR</button>`
          : '';
        const recordBtn = isActive && !isArchived
          ? `<button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--green)" onclick="openRecordPayment(${i.id})">Record</button>`
          : '';
        const payMethodBadge = i.status === 'Paid' && i.payment_method
          ? `<span style="font-size:10px;color:var(--ink-3);margin-left:4px">${escapeHtml(i.payment_method)}</span>`
          : '';
        const archiveBtn = isArchived
          ? `<button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--ink-3)" onclick="restoreInvoice(${i.id})">Restore</button>`
          : `<button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--ink-3)" onclick="archiveInvoice(${i.id})">Archive</button>`;
        const linkedSOB = _sobs.find(s => s.linked_invoice_id === i.id);
        const sobBadge = linkedSOB
          ? `<div style="font-size:9px;color:var(--ink-3);margin-top:1px">from ${escapeHtml(linkedSOB.sob_num)}</div>`
          : '';
        return `
        <tr${isArchived ? ' style="opacity:0.6"' : ''}>
          <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(i.or_num)}${sobBadge}</td>
          <td style="font-weight:500;color:var(--ink)">${escapeHtml(i.client)}</td>
          <td class="amount-cell">${formatCurrency(i.amount)}</td>
          <td style="font-size:11px;color:var(--ink-3)">${displayDate(i.date)}</td>
          <td style="font-size:11px;color:var(--ink-3)">${displayDate(i.due)}</td>
          <td><span class="badge badge-${statusClass(i.status)}">${escapeHtml(i.status)}</span>${payMethodBadge}</td>
          <td>
            <div class="flex-gap" style="gap:4px;flex-wrap:wrap">
              ${recordBtn}
              ${payLinkBtn}
              ${bpiBtn}
              <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="printInvoice(${i.id})">Print</button>
              <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="openDuplicateInvoice(${i.id})">Duplicate</button>
              <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="openEditInvoice(${i.id})">Edit</button>
              ${archiveBtn}
              <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--red)" onclick="handleDeleteInvoice(${i.id})">Delete</button>
            </div>
          </td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="7"><div class="empty-state">${_showArchivedInvoices ? 'No archived invoices' : 'No invoices yet'}</div></td></tr>`;

  // ── Recent Payments ────────────────────────────────────────────────────────
  const recentPayEl = document.getElementById('ar-recent-payments');
  if (recentPayEl && !_showArchivedInvoices) {
    const recentPaid = invoices
      .filter(i => i.status === 'Paid' && !i.archived_at)
      .sort((a, b) => (b.payment_date || b.date || '').localeCompare(a.payment_date || a.date || ''))
      .slice(0, 5);
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
  } else if (recentPayEl) {
    recentPayEl.innerHTML = '';
  }
}

export function toggleArchivedInvoices() {
  _showArchivedInvoices = !_showArchivedInvoices;
  renderAR(_invoices);
}

function toISODate(val: string | null | undefined) {
  if (!val || val === '—') return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function displayDate(val: string | null | undefined) {
  if (!val || val === '—') return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return formatDateShort(val);
  return escapeHtml(String(val));
}

function invoiceFormHTML(i: Partial<Invoice> = {}, items: InvoiceLineItem[] = []) {
  const clientOpts  = _clients.map(c => `<option value="${escapeHtml(c.name)}"/>`).join('');
  const projectOpts = `<option value="">— no project —</option>` + _projects.map(p => `<option value="${p.id}"${i.project_id === p.id ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
  const hasItems    = items.length > 0;
  const subtotal    = items.reduce((s, li) => s + li.quantity * li.unit_price, 0);
  const vatAmt      = items.reduce((s, li) => s + li.quantity * li.unit_price * li.vat_rate / 100, 0);
  const total       = subtotal + vatAmt;
  const payMethodOpts = ['GCash', 'BPI', 'PayMongo', 'Cash', 'Check', 'Bank Transfer', 'Other']
    .map(m => `<option value="${m}"${i.payment_method === m ? ' selected' : ''}>${m}</option>`).join('');
  return `<datalist id="hq-client-list">${clientOpts}</datalist>
  <div class="form-grid">
    <div class="form-group"><div class="form-label">OR / Invoice Number</div><input class="form-input" id="fi-or" value="${escapeHtml(i.or_num || '')}" placeholder="OR-2026-005"/></div>
    <div class="form-group"><div class="form-label">Client</div><input class="form-input" id="fi-client" value="${escapeHtml(i.client || '')}" list="hq-client-list" placeholder="Client name" autocomplete="off"/></div>
    <div class="form-group"><div class="form-label">Amount (₱)</div><input class="form-input" id="fi-amount" type="number" value="${hasItems ? total : (i.amount || 0)}" ${hasItems ? 'readonly' : ''} placeholder="Auto-calculated from line items"/></div>
    <div class="form-group"><div class="form-label">Status</div>
      <select class="form-input" id="fi-status" onchange="togglePaymentFields(this.value)">
        <option${i.status === 'Draft' || !i.status ? ' selected' : ''}>Draft</option>
        <option${i.status === 'Issued' || i.status === 'Unpaid' ? ' selected' : ''}>Issued</option>
        <option${i.status === 'Paid' ? ' selected' : ''}>Paid</option>
        <option${i.status === 'Overdue' ? ' selected' : ''}>Overdue</option>
        <option${i.status === 'Cancelled' ? ' selected' : ''}>Cancelled</option>
      </select>
    </div>
    <div class="form-group"><div class="form-label">Date Issued</div><input class="form-input" id="fi-date" type="date" value="${toISODate(i.date)}"/></div>
    <div class="form-group"><div class="form-label">Due Date</div><input class="form-input" id="fi-due" type="date" value="${toISODate(i.due)}"/></div>
    <div class="form-group"><div class="form-label">Client TIN (optional)</div><input class="form-input" id="fi-tin" value="${escapeHtml(i.tin || '')}" placeholder="000-000-000-000"/></div>
    <div class="form-group"><div class="form-label">Business Address (optional)</div><input class="form-input" id="fi-address" value="${escapeHtml(i.business_address || '')}" placeholder="Client's business address"/></div>
    <div class="form-group full"><div class="form-label">Project (optional)</div><select class="form-input" id="fi-project">${projectOpts}</select></div>
    <div class="form-group full"><div class="form-label">Notes (optional)</div><textarea class="form-input" id="fi-notes" rows="2" placeholder="Notes to client, payment terms, etc.">${escapeHtml(i.notes || '')}</textarea></div>
  </div>

  <div style="margin-top:18px">
    <div style="font-size:12px;font-weight:600;color:var(--ink);margin-bottom:8px">Line Items (optional)</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="border-bottom:1px solid var(--border)">
          <th style="text-align:left;padding:4px 6px;font-weight:600;color:var(--ink-3)">Description</th>
          <th style="text-align:right;padding:4px 6px;font-weight:600;color:var(--ink-3);width:56px">Qty</th>
          <th style="text-align:right;padding:4px 6px;font-weight:600;color:var(--ink-3);width:100px">Unit Price</th>
          <th style="text-align:right;padding:4px 6px;font-weight:600;color:var(--ink-3);width:50px">VAT%</th>
          <th style="text-align:right;padding:4px 6px;font-weight:600;color:var(--ink-3);width:100px">Amount</th>
          <th style="width:24px"></th>
        </tr>
      </thead>
      <tbody id="fi-line-rows">
        ${items.map(item => lineItemRowHTML(item)).join('')}
      </tbody>
    </table>
    <button type="button" class="btn btn-ghost" style="margin-top:8px;font-size:11px;padding:4px 10px" onclick="addInvoiceRow()">+ Add Row</button>
    <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px">
      <div style="display:flex;justify-content:flex-end;gap:16px;font-size:12px"><span style="color:var(--ink-3)">Subtotal</span><span id="fi-subtotal" style="font-weight:600;min-width:100px;text-align:right">${hasItems ? formatCurrency(subtotal) : '—'}</span></div>
      <div style="display:flex;justify-content:flex-end;gap:16px;font-size:12px;margin-top:4px"><span style="color:var(--ink-3)">VAT</span><span id="fi-vat-display" style="min-width:100px;text-align:right">${hasItems ? formatCurrency(vatAmt) : '—'}</span></div>
      <div style="display:flex;justify-content:flex-end;gap:16px;font-size:13px;margin-top:6px;font-weight:700"><span>Total</span><span id="fi-total-display" style="min-width:100px;text-align:right">${hasItems ? formatCurrency(total) : '—'}</span></div>
    </div>
  </div>

  <div id="fi-payment-section" style="margin-top:18px;border-top:1px solid var(--border);padding-top:14px;display:${i.status === 'Paid' ? 'block' : 'none'}">
    <div style="font-size:12px;font-weight:600;color:var(--ink);margin-bottom:8px">Official Receipt / Payment Details</div>
    <div class="form-grid">
      <div class="form-group"><div class="form-label">Payment Method</div>
        <select class="form-input" id="fi-pay-method">
          <option value="">— select —</option>
          ${payMethodOpts}
        </select>
      </div>
      <div class="form-group"><div class="form-label">Reference / Check #</div><input class="form-input" id="fi-pay-ref" value="${escapeHtml(i.payment_reference || '')}" placeholder="GCash ref, BPI confirmation, etc."/></div>
      <div class="form-group"><div class="form-label">Payment Date</div><input class="form-input" id="fi-pay-date" type="date" value="${toISODate(i.payment_date)}"/></div>
      <div class="form-group"><div class="form-label">Received By</div><input class="form-input" id="fi-received-by" value="${escapeHtml(i.received_by || '')}" placeholder="Name of person who received payment"/></div>
    </div>
  </div>`;
}

export function openAddInvoice() {
  _editingInvoiceId = null;
  _pendingSOBConvertId = null;
  openModal('New Invoice (AR)', invoiceFormHTML(), saveInvoice);
}

export function openInvoiceFromSOB(draft: Partial<Invoice>, items: InvoiceLineItem[], sobId: number) {
  _editingInvoiceId   = null;
  _pendingSOBConvertId = sobId;
  openModal('New Invoice from SOB', invoiceFormHTML(draft, items), saveInvoice);
}

export async function openEditInvoice(id: number) {
  const i = _invoices.find(x => x.id === id);
  if (!i) return;
  _editingInvoiceId = id;
  const items = await fetchLineItems(id);
  openModal('Edit Invoice', invoiceFormHTML(i, items), saveInvoice);
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
  openModal('Duplicate Invoice', invoiceFormHTML(draft, items), saveInvoice);
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
  closeModal();
  loadFinance();
}

export function openBpiQr(id: number, amount: number, client: string) {
  const { banking } = APP_SETTINGS;
  const bpiBranch = (banking as typeof banking & { bpiBranch?: string }).bpiBranch ?? '';
  const copyText = `BPI Transfer Details:\nAccount Name: ${banking.bpiAccountName}\nBranch: ${bpiBranch}\nAccount Number: ${banking.bpiAccountNumber}\nAmount: ₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}\nReference: Invoice payment — ${client}`;
  openModal('BPI Business QR — Pay via Bank Transfer', `
    <div style="text-align:center;margin-bottom:16px">
      <img src="${escapeHtml(banking.bpiQrImageUrl)}" alt="BPI QR Code" style="max-width:220px;border-radius:8px;border:1px solid var(--border)"/>
    </div>
    <div style="font-size:13px;line-height:2.2;border:1px solid var(--border);border-radius:8px;padding:12px 16px;margin-bottom:14px">
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
    </div>`, () => closeModal());
  void id;
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

// ── AP (Bills) ────────────────────────────────────────────────────────────────

export function renderAP(bills: Bill[]) {
  const total = bills.reduce((s, b) => s + b.amount, 0);
  const out   = bills.filter(b => b.status !== 'Paid').reduce((s, b) => s + b.amount, 0);
  gEl('ap-summary').textContent =
    `${bills.length} bills · ${formatCurrency(total)} total · ${formatCurrency(out)} outstanding`;
  gEl('ap-tbody').innerHTML = bills.length
    ? bills.map(b => `
        <tr>
          <td style="font-weight:500;color:var(--ink)">${escapeHtml(b.payee)}</td>
          <td class="amount-cell">${formatCurrency(b.amount)}</td>
          <td style="font-size:11px;color:var(--ink-3)">${displayDate(b.date)}</td>
          <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(b.category)}</td>
          <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(b.ewt)}</td>
          <td><span class="badge badge-${statusClass(b.status)}">${escapeHtml(b.status)}</span></td>
          <td>
            <div class="flex-gap" style="gap:4px">
              <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="openEditBill(${b.id})">Edit</button>
              <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--red)" onclick="handleDeleteBill(${b.id})">Delete</button>
            </div>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="7"><div class="empty-state">No bills yet</div></td></tr>`;
}

function billFormHTML(b: Partial<Bill> = {}) {
  const catOpts     = ['Venue', 'Catering', 'Equipment', 'Services', 'Transport', 'Supplies', 'Other']
    .map(c => `<option${c === b.category ? ' selected' : ''}>${c}</option>`).join('');
  const ewtOpts     = ['0%', '2%', '5%', '10%', '15%']
    .map(e => `<option${e === b.ewt ? ' selected' : ''}>${e}</option>`).join('');
  const partnerOpts = `<option value="">— no partner —</option>` + _partners.map(p => `<option value="${p.id}"${b.partner_id === p.id ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
  return `<div class="form-grid">
    <div class="form-group full"><div class="form-label">Payee</div><input class="form-input" id="fb-payee" value="${escapeHtml(b.payee || '')}" placeholder="Supplier / vendor name"/></div>
    <div class="form-group full"><div class="form-label">Partner / Vendor (optional)</div><select class="form-input" id="fb-partner">${partnerOpts}</select></div>
    <div class="form-group"><div class="form-label">Amount (₱)</div><input class="form-input" id="fb-amount" type="number" value="${b.amount || 0}"/></div>
    <div class="form-group"><div class="form-label">Category</div><select class="form-input" id="fb-category">${catOpts}</select></div>
    <div class="form-group"><div class="form-label">EWT Rate</div><select class="form-input" id="fb-ewt">${ewtOpts}</select></div>
    <div class="form-group"><div class="form-label">Date</div><input class="form-input" id="fb-bill-date" type="date" value="${toISODate(b.date)}"/></div>
    <div class="form-group"><div class="form-label">Status</div>
      <select class="form-input" id="fb-status">
        <option${b.status === 'Unpaid' || !b.status ? ' selected' : ''}>Unpaid</option>
        <option${b.status === 'Paid' ? ' selected' : ''}>Paid</option>
      </select>
    </div>
  </div>`;
}

export function openAddBill() {
  _editingBillId = null;
  openModal('New Bill (AP)', billFormHTML(), saveBill);
}

export function openEditBill(id: number) {
  const b = _bills.find(x => x.id === id);
  if (!b) return;
  _editingBillId = id;
  openModal('Edit Bill', billFormHTML(b), saveBill);
}

export async function saveBill() {
  const payee = gVal('fb-payee').trim();
  const err = validateRequired(payee, 'Payee');
  if (err) { toast(err, 'error'); return; }
  const amount = +gVal('fb-amount');
  if (!amount || amount <= 0) { toast('Amount must be greater than ₱0', 'error'); return; }
  const partVal = (document.getElementById('fb-partner') as HTMLInputElement | null)?.value;
  const payload = {
    payee,
    amount,
    category:   gVal('fb-category'),
    ewt:        gVal('fb-ewt'),
    date:       gVal('fb-bill-date') || null,
    status:     gVal('fb-status'),
    partner_id: partVal ? +partVal : null,
  };
  if (_editingBillId) {
    const ok = await updateBill(_editingBillId, payload);
    if (!ok) { toast('Could not update bill', 'error'); return; }
    toast('Bill updated', 'success');
  } else {
    const result = await createBill(payload);
    if (!result) { toast('Could not add bill. Please try again.', 'error'); return; }
    toast('Bill added', 'success');
  }
  closeModal();
  loadFinance();
}

export async function handleDeleteBill(id: number) {
  if (!confirm('Delete this bill? This cannot be undone.')) return;
  const ok = await deleteBill(id);
  if (!ok) { toast('Could not delete bill', 'error'); return; }
  toast('Bill deleted', '');
  loadFinance();
}

// ── Payroll ───────────────────────────────────────────────────────────────────

export function renderPayroll(runs: PayrollRun[]) {
  gEl('payroll-tbody').innerHTML = runs.length
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

function payrollFormHTML(r: Partial<PayrollRun> = {}) {
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

export function openAddPayroll() {
  _editingPayrollId = null;
  openModal('New Payroll Run', payrollFormHTML(), savePayroll);
}

export function openEditPayroll(id: number) {
  const r = _payroll.find(x => x.id === id);
  if (!r) return;
  _editingPayrollId = id;
  openModal('Edit Payroll Run', payrollFormHTML(r), savePayroll);
}

export function estimateDeductions(): void {
  const gross = +(document.getElementById('pp-gross') as HTMLInputElement).value || 0;
  const ded = Math.round(gross * 0.15);
  (document.getElementById('pp-ded') as HTMLInputElement).value = String(ded);
  (document.getElementById('pp-net') as HTMLInputElement).value = String(gross - ded);
}

export async function savePayroll() {
  const period = gVal('pp-period').trim();
  const err = validateRequired(period, 'Period');
  if (err) { toast(err, 'error'); return; }
  const gross = +gVal('pp-gross');
  if (!gross || gross <= 0) { toast('Gross amount must be greater than ₱0', 'error'); return; }
  const ded   = +gVal('pp-ded')   || 0;
  const payload = {
    period,
    employees:  +gVal('pp-emp') || 0,
    gross, deductions: ded, net: gross - ded,
    status: gVal('pp-status'),
  };
  if (_editingPayrollId) {
    const ok = await updatePayrollRun(_editingPayrollId, payload);
    if (!ok) { toast('Could not update payroll run', 'error'); return; }
    toast('Payroll run updated', 'success');
  } else {
    const result = await createPayrollRun(payload);
    if (!result) { toast('Could not save payroll run. Please try again.', 'error'); return; }
    toast('Payroll run saved', 'success');
  }
  closeModal();
  loadFinance();
}

export async function handleDeletePayroll(id: number) {
  if (!confirm('Delete this payroll run? This cannot be undone.')) return;
  const ok = await deletePayrollRun(id);
  if (!ok) { toast('Could not delete payroll run', 'error'); return; }
  toast('Payroll run deleted', '');
  loadFinance();
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
