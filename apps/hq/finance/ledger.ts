import { formatCurrency } from '@shared/utils/formatUtils.ts';
import { escapeHtml } from '@shared/utils/helpers.ts';
import { validateRequired } from '@shared/utils/validators.ts';
import { nextDocNumber } from '@shared/services/documents/docNumberService.ts';
import { getCurrentUser } from '@shared/core/authService.ts';
import { logDocActivity } from '@shared/services/documents/activityLogService.ts';
import { sb } from '@shared/core/supabase.ts';
import {
  createLedgerEntry, updateLedgerEntry, deleteLedgerEntry,
  createAccount, updateAccount, deleteAccount,
} from '@hq/finance/ledgerService.ts';
import {
  _ledger, _accounts, _projects,
} from '@hq/core/state.ts';
import { toast, openModal, closeModal } from '@hq/core/ui.ts';
import {
  ledgerRowHTML, ledgerFormHTML, accountRowHTML, accountFormHTML,
} from './templates/ledger.ts';
import { runningBalanceMap, accountBalance, cashPosition } from './ledgerCalc.ts';
import { canManageFinance } from './financePermissions.ts';
import { APP_SETTINGS } from '@config/settings.ts';
import { loadFinance } from './finance.ts';
import type { CashLedgerEntry, FinancialAccount } from '@shared/types.ts';

const gVal = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? '';

let _editingLedgerId: number | null = null;
let _editingAccountId: number | null = null;
let _ledgerAccountFilter = '';
let _ledgerCompanyFilter = '';
let _ledgerSearch = '';

// ── Cash Ledger tab ───────────────────────────────────────────────────────────

function _ledgerStatsHTML(): string {
  const pos = cashPosition(_ledger, _accounts);
  const card = (label: string, value: number, color = '') =>
    `<div class="stat-card">
      <div class="stat-label">${label}</div>
      <div class="stat-value" style="font-size:22px${color ? `;color:${color}` : ''}">${formatCurrency(value)}</div>
    </div>`;
  return `<div class="finance-stat-grid" style="margin-bottom:16px">
    ${card('Current Cash Balance', pos.total, 'var(--green)')}
    ${card('Cash on Hand', pos.byType.cash)}
    ${card('Bank Balance', pos.byType.bank)}
    ${card('E-wallet Balance', pos.byType.ewallet)}
  </div>`;
}

function _ledgerToolbarHTML(hasFilters: boolean): string {
  const acctOpts = _accounts
    .map(a => `<option value="${a.id}"${_ledgerAccountFilter === String(a.id) ? ' selected' : ''}>${escapeHtml(a.name)}</option>`)
    .join('');
  const companyOpts = APP_SETTINGS.finance.companies
    .map(c => `<option${_ledgerCompanyFilter === c ? ' selected' : ''}>${escapeHtml(c)}</option>`)
    .join('');
  return `<div class="page-actions" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">
    <div style="display:flex;gap:8px;flex:1;flex-wrap:wrap;align-items:center">
      <input class="form-input" id="cl-search" placeholder="Search description, reference…"
        value="${escapeHtml(_ledgerSearch)}" oninput="setLedgerFilter()" style="width:220px"/>
      <select class="form-input" id="cl-account-filter" onchange="setLedgerFilter()" style="width:170px">
        <option value="">All Accounts</option>${acctOpts}
      </select>
      <select class="form-input" id="cl-company-filter" onchange="setLedgerFilter()" style="width:170px">
        <option value="">All Companies</option>${companyOpts}
      </select>
      ${hasFilters ? `<button class="btn btn-ghost" onclick="clearLedgerFilters()" style="font-size:12px">Clear</button>` : ''}
    </div>
    ${canManageFinance() ? `<button class="btn btn-primary" onclick="openAddLedgerEntry()">+ New Entry</button>` : ''}
  </div>`;
}

export function renderCashLedger(): void {
  const container = document.getElementById('ftab-ledger');
  if (!container) return;

  const balances = runningBalanceMap(_ledger, _accounts);

  let filtered = [..._ledger];
  if (_ledgerAccountFilter) filtered = filtered.filter(e => String(e.account_id) === _ledgerAccountFilter);
  if (_ledgerCompanyFilter) filtered = filtered.filter(e => e.company === _ledgerCompanyFilter);
  if (_ledgerSearch) {
    const q = _ledgerSearch.toLowerCase();
    filtered = filtered.filter(e =>
      e.description.toLowerCase().includes(q) ||
      (e.reference_no ?? '').toLowerCase().includes(q));
  }
  const hasFilters = !!(_ledgerAccountFilter || _ledgerCompanyFilter || _ledgerSearch);

  const rows = filtered.length
    ? filtered.map(e => ledgerRowHTML(e, balances.get(e.id) ?? NaN, _accounts)).join('')
    : `<tr><td colspan="10"><div class="empty-state">${hasFilters ? 'No entries match filters' : 'No ledger entries yet — click “New Entry” to start.'}</div></td></tr>`;

  container.innerHTML =
    _ledgerStatsHTML() +
    _ledgerToolbarHTML(hasFilters) + `
    <div style="border:1px solid var(--ink-4);overflow-x:auto">
      <table class="ledger-table">
        <thead><tr>
          <th>Date</th><th>Ref #</th><th>Description</th><th>Category</th><th>Company</th>
          <th>Account</th><th>Cash In</th><th>Cash Out</th><th>Balance</th><th aria-label="Actions"></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

export function setLedgerFilter(): void {
  _ledgerSearch = (document.getElementById('cl-search') as HTMLInputElement | null)?.value ?? '';
  _ledgerAccountFilter = (document.getElementById('cl-account-filter') as HTMLSelectElement | null)?.value ?? '';
  _ledgerCompanyFilter = (document.getElementById('cl-company-filter') as HTMLSelectElement | null)?.value ?? '';
  renderCashLedger();
}

export function clearLedgerFilters(): void {
  _ledgerSearch = '';
  _ledgerAccountFilter = '';
  _ledgerCompanyFilter = '';
  renderCashLedger();
}

export function openAddLedgerEntry(): void {
  if (!canManageFinance()) { toast('You do not have permission to add finance records', 'error'); return; }
  if (_accounts.length === 0) {
    toast('Create an account in Settings first', 'error');
    return;
  }
  _editingLedgerId = null;
  openModal('New Ledger Entry', ledgerFormHTML({}, false, _accounts, _projects), saveLedgerEntry);
}

export function openEditLedgerEntry(id: number): void {
  const e = _ledger.find(x => x.id === id);
  if (!e) return;
  if (e.module_source !== 'Manual') {
    toast(_lockedRowMessage(e.module_source), 'error');
    return;
  }
  _editingLedgerId = id;
  openModal('Edit Ledger Entry', ledgerFormHTML(e, true, _accounts, _projects), saveLedgerEntry);
}

// Entries posted by another module are managed from that module, not here.
function _lockedRowMessage(moduleSource: string): string {
  switch (moduleSource) {
    case 'Founder': return 'This entry is managed from the Founder Capital tab';
    case 'AR':      return 'This entry came from a paid invoice — manage it in Receivables';
    case 'AP':      return 'This entry came from a paid expense — manage it in Payables';
    case 'Payroll': return 'This entry came from a payroll run — manage it in Payroll';
    default:        return 'This entry is managed by another module';
  }
}

function _readLedgerForm(): Partial<CashLedgerEntry> | null {
  const description = gVal('cl-desc').trim();
  const descErr = validateRequired(description, 'Description');
  if (descErr) { toast(descErr, 'error'); return null; }

  const account_id = +gVal('cl-account') || null;
  if (!account_id) { toast('Please choose an account', 'error'); return null; }

  const cash_in = +gVal('cl-in') || 0;
  const cash_out = +gVal('cl-out') || 0;
  if (cash_in < 0 || cash_out < 0) { toast('Amounts cannot be negative', 'error'); return null; }
  if (cash_in === 0 && cash_out === 0) { toast('Enter a Cash In or Cash Out amount', 'error'); return null; }
  if (cash_in > 0 && cash_out > 0) { toast('Enter either Cash In or Cash Out, not both', 'error'); return null; }

  return {
    txn_date: gVal('cl-date') || new Date().toISOString().slice(0, 10),
    description,
    category: gVal('cl-category') || null,
    account_id,
    payment_method: gVal('cl-method') || null,
    company: gVal('cl-company') || null,
    project_id: +gVal('cl-project') || null,
    cash_in,
    cash_out,
    notes: gVal('cl-notes').trim() || null,
  };
}

// Upload an optional ledger attachment to the shared receipts bucket; returns a
// signed URL, or null on failure (upload issues never block saving the entry).
const ATTACHMENT_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

async function _uploadLedgerAttachment(file: File): Promise<string | null> {
  if (file.size > 5 * 1024 * 1024) { toast('Attachment must be under 5 MB', 'error'); return null; }
  const ext = (file.name.split('.').pop() ?? 'bin').slice(0, 10);
  const path = `ledger/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from('receipts').upload(path, file, { upsert: false });
  if (error) { console.error('ledger attachment upload failed:', error); toast('Attachment upload failed', 'error'); return null; }
  const { data } = await sb.storage.from('receipts').createSignedUrl(path, ATTACHMENT_TTL_SECONDS);
  return data?.signedUrl ?? null;
}

export async function saveLedgerEntry(): Promise<void> {
  if (!canManageFinance()) { toast('You do not have permission to edit finance records', 'error'); return; }
  const payload = _readLedgerForm();
  if (!payload) return;

  // Optional attachment — upload before persisting so the URL is part of the row.
  const fileInput = document.getElementById('cl-attachment') as HTMLInputElement | null;
  const file = fileInput?.files?.[0] ?? null;
  if (file) {
    const url = await _uploadLedgerAttachment(file);
    if (url) payload.attachment_url = url;
  }
  try {
    const user = await getCurrentUser();
    const actor = user?.name ?? user?.email ?? null;
    if (_editingLedgerId !== null) {
      const ok = await updateLedgerEntry(_editingLedgerId, payload);
      if (!ok) { toast('Could not update entry', 'error'); return; }
      await logDocActivity('ledger', _editingLedgerId, payload.reference_no ?? null, 'updated', actor);
      toast('Ledger entry updated', 'success');
    } else {
      payload.reference_no = nextDocNumber('CL', _ledger.map(e => e.reference_no ?? ''));
      payload.module_source = 'Manual';
      payload.created_by = actor;
      const result = await createLedgerEntry(payload);
      if (!result) { toast('Could not save entry. Please try again.', 'error'); return; }
      await logDocActivity('ledger', result.id, result.reference_no ?? null, 'created', actor);
      toast('Ledger entry saved', 'success');
    }
    closeModal();
    await loadFinance();
  } catch (error) {
    console.error('saveLedgerEntry failed:', error);
    toast('An unexpected error occurred. Please try again.', 'error');
  }
}

export async function handleDeleteLedgerEntry(id: number): Promise<void> {
  if (!canManageFinance()) { toast('You do not have permission to delete finance records', 'error'); return; }
  const e = _ledger.find(x => x.id === id);
  if (e && e.module_source !== 'Manual') {
    toast(_lockedRowMessage(e.module_source), 'error');
    return;
  }
  if (!confirm('Delete this ledger entry? This cannot be undone.')) return;
  try {
    const ok = await deleteLedgerEntry(id);
    if (!ok) { toast('Could not delete entry', 'error'); return; }
    await logDocActivity('ledger', id, e?.reference_no ?? null, 'archived', null);
    toast('Ledger entry deleted', 'success');
    await loadFinance();
  } catch (error) {
    console.error('handleDeleteLedgerEntry failed:', error);
    toast('An unexpected error occurred. Please try again.', 'error');
  }
}

// ── Settings: Financial Accounts ──────────────────────────────────────────────

export function renderAccountsSettings(): void {
  const container = document.getElementById('ftab-settings');
  if (!container) return;

  const rows = _accounts.length
    ? _accounts.map(a => accountRowHTML(a, accountBalance(a.id, _ledger, _accounts))).join('')
    : `<tr><td colspan="6"><div class="empty-state">No accounts yet — add your cash, bank and e-wallet accounts to start.</div></td></tr>`;

  container.innerHTML = `
    <div class="page-actions" style="margin-bottom:12px">
      <div style="font-size:12px;color:var(--ink-3)">Financial accounts the Cash Ledger posts into. The <strong>Default</strong> account receives auto-posted invoice, expense and payroll payments.</div>
      ${canManageFinance() ? `<button class="btn btn-primary" onclick="openAddAccount()">+ New Account</button>` : ''}
    </div>
    <div style="border:1px solid var(--ink-4);overflow-x:auto">
      <table class="ledger-table">
        <thead><tr>
          <th>Account</th><th>Type</th><th>Opening Balance</th>
          <th>Current Balance</th><th>Status</th><th aria-label="Actions"></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

export function openAddAccount(): void {
  if (!canManageFinance()) { toast('You do not have permission to manage accounts', 'error'); return; }
  _editingAccountId = null;
  openModal('New Account', accountFormHTML(), saveAccount);
}

export function openEditAccount(id: number): void {
  const a = _accounts.find(x => x.id === id);
  if (!a) return;
  _editingAccountId = id;
  openModal('Edit Account', accountFormHTML(a), saveAccount);
}

function _readAccountForm(): Partial<FinancialAccount> | null {
  const name = gVal('fa-name').trim();
  const nameErr = validateRequired(name, 'Account name');
  if (nameErr) { toast(nameErr, 'error'); return null; }
  const rawType = gVal('fa-type');
  const type = (['cash', 'bank', 'ewallet'] as const).includes(rawType as FinancialAccount['type'])
    ? rawType as FinancialAccount['type'] : 'bank';
  const payload: Partial<FinancialAccount> = {
    name,
    type,
    opening_balance: +gVal('fa-opening') || 0,
    notes: gVal('fa-notes').trim() || null,
  };
  if (_editingAccountId !== null) {
    payload.is_active = (document.getElementById('fa-active') as HTMLInputElement | null)?.checked ?? true;
  }
  return payload;
}

export async function saveAccount(): Promise<void> {
  if (!canManageFinance()) { toast('You do not have permission to manage accounts', 'error'); return; }
  const payload = _readAccountForm();
  if (!payload) return;
  // An inactive account is dropped from Cash Position — block deactivating one
  // that still holds money so the headline cash figure can't silently understate.
  if (_editingAccountId !== null && payload.is_active === false) {
    const bal = accountBalance(_editingAccountId, _ledger, _accounts);
    if (Math.abs(bal) > 0.005) {
      toast(`This account still holds ${formatCurrency(bal)} — transfer or withdraw it to ₱0 before setting it Inactive`, 'error');
      return;
    }
  }
  try {
    if (_editingAccountId !== null) {
      const ok = await updateAccount(_editingAccountId, payload);
      if (!ok) { toast('Could not update account', 'error'); return; }
      await logDocActivity('account', _editingAccountId, payload.name ?? null, 'updated', null);
      toast('Account updated', 'success');
    } else {
      // First account created becomes the default target for auto-posting.
      if (_accounts.length === 0) payload.is_default = true;
      const result = await createAccount(payload);
      if (!result) { toast('Could not save account. Please try again.', 'error'); return; }
      await logDocActivity('account', result.id, result.name ?? null, 'created', null);
      toast('Account created', 'success');
    }
    closeModal();
    await loadFinance();
  } catch (error) {
    console.error('saveAccount failed:', error);
    toast('An unexpected error occurred. Please try again.', 'error');
  }
}

// Make one account the default AR/AP/Payroll posting target, clearing the flag
// on all others so exactly one account is ever default.
export async function setDefaultAccount(id: number): Promise<void> {
  if (!canManageFinance()) { toast('You do not have permission to manage accounts', 'error'); return; }
  try {
    for (const a of _accounts) {
      const shouldBeDefault = a.id === id;
      if (a.is_default === shouldBeDefault) continue;
      const ok = await updateAccount(a.id, { is_default: shouldBeDefault });
      if (!ok) { toast('Could not set default account', 'error'); return; }
    }
    toast('Default account updated', 'success');
    await loadFinance();
  } catch (error) {
    console.error('setDefaultAccount failed:', error);
    toast('An unexpected error occurred. Please try again.', 'error');
  }
}

export async function handleDeleteAccount(id: number): Promise<void> {
  if (!canManageFinance()) { toast('You do not have permission to manage accounts', 'error'); return; }
  const hasEntries = _ledger.some(e => e.account_id === id);
  if (hasEntries) {
    toast('This account has ledger entries — set it Inactive instead of deleting', 'error');
    return;
  }
  if (!confirm('Delete this account? This cannot be undone.')) return;
  try {
    const ok = await deleteAccount(id);
    if (!ok) { toast('Could not delete account', 'error'); return; }
    toast('Account deleted', 'success');
    await loadFinance();
  } catch (error) {
    console.error('handleDeleteAccount failed:', error);
    toast('An unexpected error occurred. Please try again.', 'error');
  }
}
