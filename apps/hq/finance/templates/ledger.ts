import type { FinancialAccount, CashLedgerEntry, Project } from '@shared/types.ts';
import { escapeHtml } from '@shared/utils/helpers.ts';
import { formatCurrency } from '@shared/utils/formatUtils.ts';
import { formatDateShort } from '@shared/utils/dateUtils.ts';
import { APP_SETTINGS } from '@config/settings.ts';

// ── Constants (from handout §3) ───────────────────────────────────────────────

export const ACCOUNT_TYPES: ReadonlyArray<{ value: FinancialAccount['type']; label: string }> = [
  { value: 'cash',    label: 'Cash on Hand' },
  { value: 'bank',    label: 'Bank' },
  { value: 'ewallet', label: 'E-wallet' },
];

// The DestineVents group: the "Team" categories carry over from the 2026
// finance spreadsheet so the books stay recognisable to whoever kept them.
// Team Fee deliberately sits in both directions — a fee earned goes in Cash In,
// a fee paid to the team goes in Cash Out, exactly as the spreadsheet had it.
export const LEDGER_CATEGORIES = {
  Income:   ['Client Payment', 'Team Fee', 'Affiliate Sales', 'Sales', 'Grant', 'Donation', 'Investment', 'Other Income'],
  Expense:  ['Team Expenses', 'Team Fee', 'Affiliate Fee', 'Founder Expenses', 'Payroll', 'Marketing', 'Software', 'Utilities', 'Office', 'Travel', 'Equipment', 'Operations', 'Taxes', 'Miscellaneous'],
  Internal: ['Founder Capital', 'Founder Withdrawal', 'Transfer', 'Adjustment'],
} as const;

export const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'GCash', 'Maya', 'Check', 'Card', 'Other'];

function toISODate(val: string | null | undefined): string {
  if (!val) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function displayDate(val: string | null | undefined): string {
  if (!val) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return formatDateShort(val);
  return escapeHtml(String(val));
}

const accountTypeLabel = (t: string) =>
  ACCOUNT_TYPES.find(a => a.value === t)?.label ?? t;

// ── Cash Ledger rows ──────────────────────────────────────────────────────────

export function ledgerRowHTML(
  e: CashLedgerEntry,
  runningBalance: number,
  accounts: FinancialAccount[],
): string {
  const account = accounts.find(a => a.id === e.account_id);
  const accName = account ? escapeHtml(account.name) : '—';
  const isLinked = e.module_source !== 'Manual';
  const balCell = Number.isNaN(runningBalance) ? '—' : formatCurrency(runningBalance);

  // Rows posted by another module (Founder / AR / AP / Payroll) are managed
  // there and are read-only in the ledger.
  const actions = isLinked
    ? `<span style="font-size:10px;color:var(--ink-3)" title="Managed in ${escapeHtml(e.module_source)}">${escapeHtml(e.module_source)}-linked</span>`
    : `<button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="openEditLedgerEntry(${e.id})">Edit</button>
       <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--red)" onclick="handleDeleteLedgerEntry(${e.id})">Delete</button>`;

  return `<tr>
    <td style="font-size:11px;color:var(--ink-3)">${displayDate(e.txn_date)}</td>
    <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(e.reference_no ?? '—')}</td>
    <td style="font-weight:500;color:var(--ink)">${escapeHtml(e.description)}${isLinked ? ` <span class="badge badge-pending" style="font-size:9px">${escapeHtml(e.module_source)}</span>` : ''}${e.attachment_url ? ` <button type="button" title="View attachment" aria-label="View attachment" onclick="openLedgerAttachment(${e.id})" style="background:none;border:none;padding:0;cursor:pointer;color:var(--gold);font-size:11px">&#128206;</button>` : ''}</td>
    <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(e.category ?? '—')}</td>
    <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(e.company ?? '—')}</td>
    <td style="font-size:11px;color:var(--ink-3)">${accName}</td>
    <td class="amount-cell" style="color:var(--green)">${e.cash_in ? formatCurrency(e.cash_in) : '—'}</td>
    <td class="amount-cell" style="color:var(--red)">${e.cash_out ? formatCurrency(e.cash_out) : '—'}</td>
    <td class="amount-cell" style="font-weight:600">${balCell}</td>
    <td><div class="flex-gap" style="gap:4px">${actions}</div></td>
  </tr>`;
}

// ── Cash Ledger form ──────────────────────────────────────────────────────────

export function ledgerFormHTML(
  e: Partial<CashLedgerEntry>,
  isEdit: boolean,
  accounts: FinancialAccount[],
  projects: Project[],
): string {
  const activeAccounts = accounts.filter(a => a.is_active || a.id === e.account_id);
  const acctOpts = activeAccounts.length
    ? activeAccounts.map(a => `<option value="${a.id}"${e.account_id === a.id ? ' selected' : ''}>${escapeHtml(a.name)} (${accountTypeLabel(a.type)})</option>`).join('')
    : '';
  // A category can appear in two groups (Team Fee is both earned and paid), so
  // only the first match is marked selected — two selected options in one
  // single-choice select is invalid HTML.
  let categoryMatched = false;
  const catOpts = Object.entries(LEDGER_CATEGORIES).map(([group, cats]) =>
    `<optgroup label="${group}">${(cats as readonly string[]).map(c => {
      const selected = !categoryMatched && c === e.category;
      if (selected) categoryMatched = true;
      return `<option${selected ? ' selected' : ''}>${escapeHtml(c)}</option>`;
    }).join('')}</optgroup>`
  ).join('');
  const companyOpts = `<option value="">— No company —</option>` +
    APP_SETTINGS.finance.companies
      .map(c => `<option${e.company === c ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('');
  const pmOpts = PAYMENT_METHODS.map(m => `<option${m === e.payment_method ? ' selected' : ''}>${m}</option>`).join('');
  const projOpts = `<option value="">— No project —</option>` +
    projects.map(p => `<option value="${p.id}"${e.project_id === p.id ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('');

  const noAccountsWarning = accounts.length === 0
    ? `<div class="form-group full"><div style="font-size:11px;color:var(--amber)">Note: create an account in <strong>Settings</strong> first — every ledger entry needs an account.</div></div>`
    : '';

  return `<div class="form-grid">
    ${noAccountsWarning}
    <div class="form-group"><div class="form-label">Reference #</div><input class="form-input" id="cl-ref" value="${escapeHtml(e.reference_no ?? '')}" placeholder="Auto-generated" ${isEdit ? '' : 'readonly'}/></div>
    <div class="form-group"><div class="form-label">Date *</div><input class="form-input" id="cl-date" type="date" value="${toISODate(e.txn_date) || new Date().toISOString().slice(0, 10)}"/></div>
    <div class="form-group full"><div class="form-label">Description *</div><input class="form-input" id="cl-desc" value="${escapeHtml(e.description ?? '')}" placeholder="What is this transaction for?"/></div>
    <div class="form-group"><div class="form-label">Category</div><select class="form-input" id="cl-category">${catOpts}</select></div>
    <div class="form-group"><div class="form-label">Account *</div><select class="form-input" id="cl-account">${acctOpts}</select></div>
    <div class="form-group"><div class="form-label">Payment Method</div><select class="form-input" id="cl-method">${pmOpts}</select></div>
    <div class="form-group"><div class="form-label">Company</div><select class="form-input" id="cl-company">${companyOpts}</select></div>
    <div class="form-group"><div class="form-label">Project (optional)</div><select class="form-input" id="cl-project">${projOpts}</select></div>
    <div class="form-group"><div class="form-label">Cash In (₱)</div><input class="form-input" id="cl-in" type="number" min="0" step="0.01" value="${e.cash_in ?? 0}"/></div>
    <div class="form-group"><div class="form-label">Cash Out (₱)</div><input class="form-input" id="cl-out" type="number" min="0" step="0.01" value="${e.cash_out ?? 0}"/></div>
    <div class="form-group full"><div class="form-label">Notes</div><textarea class="form-input" id="cl-notes" rows="2" placeholder="Optional details">${escapeHtml(e.notes ?? '')}</textarea></div>
    <div class="form-group full">
      <div class="form-label">Attachment (optional)</div>
      <input class="form-input" id="cl-attachment" type="file" accept="image/*,application/pdf" style="padding:6px"/>
      ${e.attachment_url && e.id ? `<div style="font-size:11px;margin-top:4px"><button type="button" onclick="openLedgerAttachment(${e.id})" style="background:none;border:none;padding:0;cursor:pointer;color:var(--gold);font:inherit;text-decoration:underline">View current attachment</button> — choosing a new file replaces it.</div>` : ''}
    </div>
  </div>
  <div style="font-size:10.5px;color:var(--ink-3);margin-top:8px">Enter an amount in <strong>Cash In</strong> for money received, or <strong>Cash Out</strong> for money spent — not both.</div>`;
}

// ── Account (Settings) rows + form ────────────────────────────────────────────

export function accountRowHTML(a: FinancialAccount, currentBalance: number): string {
  const defaultBadge = a.is_default
    ? ' <span class="badge badge-paid" style="font-size:9px">Default</span>'
    : '';
  const makeDefaultBtn = a.is_default || !a.is_active
    ? ''
    : `<button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="setDefaultAccount(${a.id})">Make Default</button>`;
  return `<tr${a.is_active ? '' : ' style="opacity:0.5"'}>
    <td style="font-weight:500;color:var(--ink)">${escapeHtml(a.name)}${defaultBadge}</td>
    <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(accountTypeLabel(a.type))}</td>
    <td class="amount-cell">${formatCurrency(a.opening_balance || 0)}</td>
    <td class="amount-cell" style="font-weight:600">${formatCurrency(currentBalance)}</td>
    <td><span class="badge badge-${a.is_active ? 'paid' : 'cancelled'}">${a.is_active ? 'Active' : 'Inactive'}</span></td>
    <td><div class="flex-gap" style="gap:4px">
      ${makeDefaultBtn}
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="openEditAccount(${a.id})">Edit</button>
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--red)" onclick="handleDeleteAccount(${a.id})">Delete</button>
    </div></td>
  </tr>`;
}

export function accountFormHTML(a: Partial<FinancialAccount> = {}): string {
  const typeOpts = ACCOUNT_TYPES.map(t => `<option value="${t.value}"${a.type === t.value ? ' selected' : ''}>${t.label}</option>`).join('');
  return `<div class="form-grid">
    <div class="form-group full"><div class="form-label">Account Name *</div><input class="form-input" id="fa-name" value="${escapeHtml(a.name ?? '')}" placeholder="e.g. BPI, GCash, Cash on Hand"/></div>
    <div class="form-group"><div class="form-label">Type</div><select class="form-input" id="fa-type">${typeOpts}</select></div>
    <div class="form-group"><div class="form-label">Opening Balance (₱)</div><input class="form-input" id="fa-opening" type="number" step="0.01" value="${a.opening_balance ?? 0}"/></div>
    <div class="form-group full"><div class="form-label">Notes</div><input class="form-input" id="fa-notes" value="${escapeHtml(a.notes ?? '')}" placeholder="Optional"/></div>
    ${a.id ? `<div class="form-group full"><label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer"><input type="checkbox" id="fa-active"${a.is_active ? ' checked' : ''}/> Active</label></div>` : ''}
  </div>`;
}
