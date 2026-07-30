import { formatCurrency } from '@shared/utils/formatUtils.ts';
import { escapeHtml } from '@shared/utils/helpers.ts';
import { formatDateShort } from '@shared/utils/dateUtils.ts';
import { nextDocNumber } from '@shared/services/documents/docNumberService.ts';
import { getCurrentUser } from '@shared/core/authService.ts';
import { logDocActivity } from '@shared/services/documents/activityLogService.ts';
import {
  createFounderEntry, updateFounderEntry, deleteFounderEntry,
} from '@hq/finance/founderService.ts';
import {
  createLedgerEntry, updateLedgerEntry, deleteLedgerEntry,
} from '@hq/finance/ledgerService.ts';
import { _founderCapital, _accounts, _ledger } from '@hq/core/state.ts';
import { toast, openModal, closeModal } from '@hq/core/ui.ts';
import { founderEquity } from './ledgerCalc.ts';
import { canManageFinance } from './financePermissions.ts';
import { loadFinance } from './finance.ts';
import type {
  FounderCapitalEntry, FounderTransactionType, CashLedgerEntry,
} from '@shared/types.ts';

const gVal = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? '';
const DEFAULT_FOUNDER = 'Miss Jenn';

let _editingFounderId: number | null = null;

// ── Templates (small — kept local to this module) ─────────────────────────────

function founderRowHTML(f: FounderCapitalEntry): string {
  const account = _accounts.find(a => a.id === f.account_id);
  const isContribution = f.transaction_type === 'Capital Contribution';
  return `<tr>
    <td style="font-size:11px;color:var(--ink-3)">${f.txn_date ? formatDateShort(f.txn_date) : '—'}</td>
    <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(f.reference_no ?? '—')}</td>
    <td style="font-weight:500;color:var(--ink)">${escapeHtml(f.founder)}</td>
    <td><span class="badge badge-${isContribution ? 'paid' : 'pending'}">${escapeHtml(f.transaction_type)}</span></td>
    <td class="amount-cell" style="color:${isContribution ? 'var(--green)' : 'var(--red)'}">${formatCurrency(f.amount || 0)}</td>
    <td style="font-size:11px;color:var(--ink-3)">${account ? escapeHtml(account.name) : '—'}</td>
    <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(f.notes ?? '—')}</td>
    <td><div class="flex-gap" style="gap:4px">
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="openEditFounderEntry(${f.id})">Edit</button>
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--red)" onclick="handleDeleteFounderEntry(${f.id})">Delete</button>
    </div></td>
  </tr>`;
}

function founderFormHTML(f: Partial<FounderCapitalEntry> = {}): string {
  const isEdit = f.id != null;
  const types: FounderTransactionType[] = ['Capital Contribution', 'Owner Withdrawal'];
  const typeOpts = types.map(t => `<option${t === f.transaction_type ? ' selected' : ''}>${t}</option>`).join('');
  const activeAccounts = _accounts.filter(a => a.is_active || a.id === f.account_id);
  const acctOpts = activeAccounts.map(a => `<option value="${a.id}"${f.account_id === a.id ? ' selected' : ''}>${escapeHtml(a.name)}</option>`).join('');
  const warning = _accounts.length === 0
    ? `<div class="form-group full"><div style="font-size:11px;color:var(--amber)">Note: create an account in <strong>Settings</strong> first.</div></div>`
    : '';
  return `<div class="form-grid">
    ${warning}
    <div class="form-group"><div class="form-label">Reference #</div><input class="form-input" id="fc-ref" value="${escapeHtml(f.reference_no ?? '')}" placeholder="Auto-generated" readonly/></div>
    <div class="form-group"><div class="form-label">Date *</div><input class="form-input" id="fc-date" type="date" value="${f.txn_date ?? new Date().toISOString().slice(0, 10)}"/></div>
    <div class="form-group"><div class="form-label">Founder</div><input class="form-input" id="fc-founder" value="${escapeHtml(f.founder ?? DEFAULT_FOUNDER)}"/></div>
    <div class="form-group"><div class="form-label">Transaction Type *</div><select class="form-input" id="fc-type">${typeOpts}</select></div>
    <div class="form-group"><div class="form-label">Amount (₱) *</div><input class="form-input" id="fc-amount" type="number" min="0" step="0.01" value="${f.amount ?? 0}"/></div>
    <div class="form-group"><div class="form-label">Account *</div><select class="form-input" id="fc-account">${acctOpts}</select></div>
    <div class="form-group full"><div class="form-label">Notes</div><textarea class="form-input" id="fc-notes" rows="2" placeholder="Optional details">${escapeHtml(f.notes ?? '')}</textarea></div>
  </div>
  <div style="font-size:10.5px;color:var(--ink-3);margin-top:8px">${isEdit ? 'Editing also updates the linked Cash Ledger entry.' : 'This will also post a matching entry to the Cash Ledger for the chosen account.'}</div>`;
}

// ── Render ────────────────────────────────────────────────────────────────────

export function renderFounderCapital(): void {
  const container = document.getElementById('ftab-founder');
  if (!container) return;

  const eq = founderEquity(_founderCapital);
  const rows = _founderCapital.length
    ? _founderCapital.map(founderRowHTML).join('')
    : `<tr><td colspan="8"><div class="empty-state">No founder capital entries yet.</div></td></tr>`;

  container.innerHTML = `
    <div class="finance-stat-grid" style="margin-bottom:16px">
      <div class="stat-card"><div class="stat-label">Capital Invested</div><div class="stat-value" style="font-size:22px;color:var(--green)">${formatCurrency(eq.totalCapital)}</div></div>
      <div class="stat-card"><div class="stat-label">Owner Withdrawals</div><div class="stat-value" style="font-size:22px;color:var(--red)">${formatCurrency(eq.totalWithdrawals)}</div></div>
      <div class="stat-card"><div class="stat-label">Net Owner Equity</div><div class="stat-value" style="font-size:22px">${formatCurrency(eq.netEquity)}</div></div>
    </div>
    <div class="page-actions" style="margin-bottom:12px">
      <div style="font-size:12px;color:var(--ink-3)">Capital contributions &amp; owner withdrawals.</div>
      ${canManageFinance() ? `<button class="btn btn-primary" onclick="openAddFounderEntry()">+ New Entry</button>` : ''}
    </div>
    <div style="border:1px solid var(--ink-4);overflow-x:auto">
      <table class="ledger-table">
        <thead><tr>
          <th>Date</th><th>Ref #</th><th>Founder</th><th>Type</th>
          <th>Amount</th><th>Account</th><th>Notes</th><th aria-label="Actions"></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

export function openAddFounderEntry(): void {
  if (!canManageFinance()) { toast('You do not have permission to add founder entries', 'error'); return; }
  if (_accounts.length === 0) { toast('Create an account in Settings first', 'error'); return; }
  _editingFounderId = null;
  openModal('New Founder Capital Entry', founderFormHTML(), saveFounderEntry);
}

export function openEditFounderEntry(id: number): void {
  const f = _founderCapital.find(x => x.id === id);
  if (!f) return;
  _editingFounderId = id;
  openModal('Edit Founder Capital Entry', founderFormHTML(f), saveFounderEntry);
}

interface FounderForm {
  txn_date: string;
  founder: string;
  transaction_type: FounderTransactionType;
  amount: number;
  account_id: number;
  notes: string | null;
}

function _readFounderForm(): FounderForm | null {
  const rawType = gVal('fc-type');
  const transaction_type: FounderTransactionType =
    rawType === 'Owner Withdrawal' ? 'Owner Withdrawal' : 'Capital Contribution';
  const amount = +gVal('fc-amount') || 0;
  if (amount <= 0) { toast('Amount must be greater than ₱0', 'error'); return null; }
  const account_id = +gVal('fc-account') || 0;
  if (!account_id) { toast('Please choose an account', 'error'); return null; }
  return {
    txn_date: gVal('fc-date') || new Date().toISOString().slice(0, 10),
    founder: gVal('fc-founder').trim() || DEFAULT_FOUNDER,
    transaction_type,
    amount,
    account_id,
    notes: gVal('fc-notes').trim() || null,
  };
}

// The cash_ledger fields that mirror a founder transaction (no reference_no /
// created_by — those are set once at creation and never overwritten on edit).
function _ledgerPayloadFor(form: FounderForm): Partial<CashLedgerEntry> {
  const isContribution = form.transaction_type === 'Capital Contribution';
  return {
    txn_date: form.txn_date,
    description: `${form.transaction_type} — ${form.founder}`,
    category: isContribution ? 'Founder Capital' : 'Founder Withdrawal',
    module_source: 'Founder',
    account_id: form.account_id,
    cash_in: isContribution ? form.amount : 0,
    cash_out: isContribution ? 0 : form.amount,
    notes: form.notes,
  };
}

export async function saveFounderEntry(): Promise<void> {
  if (!canManageFinance()) { toast('You do not have permission to add founder entries', 'error'); return; }
  const form = _readFounderForm();
  if (!form) return;
  try {
    const user = await getCurrentUser();
    const createdBy = user?.name ?? user?.email ?? null;

    if (_editingFounderId !== null) {
      await _updateFounderEntry(_editingFounderId, form, createdBy);
    } else {
      await _createFounderEntry(form, createdBy);
    }
    closeModal();
    await loadFinance();
  } catch (error) {
    console.error('saveFounderEntry failed:', error);
    toast('An unexpected error occurred. Please try again.', 'error');
  }
}

// Create the ledger row first, then the founder row linked to it; roll the
// ledger row back if the founder insert fails so we never orphan cash.
async function _createFounderEntry(form: FounderForm, createdBy: string | null): Promise<void> {
  const ledgerRef = nextDocNumber('CL', _ledger.map(e => e.reference_no ?? ''));
  const ledgerRow = await createLedgerEntry({
    ..._ledgerPayloadFor(form),
    reference_no: ledgerRef,
    created_by: createdBy,
  });
  if (!ledgerRow) { toast('Could not post to the Cash Ledger. Please try again.', 'error'); return; }

  const founderRef = nextDocNumber('FC', _founderCapital.map(f => f.reference_no ?? ''));
  const result = await createFounderEntry({
    reference_no: founderRef,
    txn_date: form.txn_date,
    founder: form.founder,
    transaction_type: form.transaction_type,
    amount: form.amount,
    account_id: form.account_id,
    ledger_id: ledgerRow.id,
    notes: form.notes,
  });
  if (!result) {
    const rolledBack = await deleteLedgerEntry(ledgerRow.id); // rollback the orphan
    toast(rolledBack
      ? 'Could not save founder entry. Please try again.'
      : `Could not save founder entry, and its Cash Ledger row (${ledgerRef}) could not be rolled back — please remove it in Supabase.`, 'error');
    return;
  }
  await logDocActivity('founder', result.id, founderRef, 'created', createdBy);
  toast('Founder entry saved and posted to the Cash Ledger', 'success');
}

async function _updateFounderEntry(id: number, form: FounderForm, createdBy: string | null): Promise<void> {
  const existing = _founderCapital.find(f => f.id === id);
  const ok = await updateFounderEntry(id, {
    txn_date: form.txn_date,
    founder: form.founder,
    transaction_type: form.transaction_type,
    amount: form.amount,
    account_id: form.account_id,
    notes: form.notes,
  });
  if (!ok) { toast('Could not update founder entry', 'error'); return; }

  // Keep the linked ledger row in sync (reference_no / created_by untouched).
  if (existing?.ledger_id) {
    const ledgerOk = await updateLedgerEntry(existing.ledger_id, _ledgerPayloadFor(form));
    if (!ledgerOk) {
      toast('Founder entry updated, but its Cash Ledger row could not be synced — please retry', 'error');
      return;
    }
  } else {
    // Defensive: the mirror row is missing — recreate and relink it.
    const ledgerRef = nextDocNumber('CL', _ledger.map(e => e.reference_no ?? ''));
    const ledgerRow = await createLedgerEntry({ ..._ledgerPayloadFor(form), reference_no: ledgerRef, created_by: createdBy });
    if (ledgerRow) await updateFounderEntry(id, { ledger_id: ledgerRow.id });
  }
  await logDocActivity('founder', id, existing?.reference_no ?? null, 'updated', createdBy);
  toast('Founder entry updated', 'success');
}

export async function handleDeleteFounderEntry(id: number): Promise<void> {
  if (!canManageFinance()) { toast('You do not have permission to delete founder entries', 'error'); return; }
  const f = _founderCapital.find(x => x.id === id);
  if (!f) return;
  if (!confirm('Delete this founder entry? Its Cash Ledger entry will also be removed.')) return;
  try {
    const ok = await deleteFounderEntry(id);
    if (!ok) { toast('Could not delete founder entry', 'error'); return; }
    if (f.ledger_id) {
      const ledgerOk = await deleteLedgerEntry(f.ledger_id);
      if (!ledgerOk) {
        toast('Founder entry removed, but its Cash Ledger row could not be deleted — please remove it in Supabase', 'error');
      }
    }
    await logDocActivity('founder', id, f.reference_no ?? null, 'archived', null);
    toast('Founder entry deleted', 'success');
    await loadFinance();
  } catch (error) {
    console.error('handleDeleteFounderEntry failed:', error);
    toast('An unexpected error occurred. Please try again.', 'error');
  }
}
