import { validateRequired } from '@shared/utils/validators.ts';
import { escapeHtml } from '@shared/utils/helpers.ts';
import { APP_SETTINGS } from '@config/settings.ts';
import { nextDocNumber } from '@shared/services/documents/docNumberService.ts';
import { logDocActivity } from '@shared/services/documents/activityLogService.ts';
import { getCurrentUser } from '@shared/core/authService.ts';
import { buildDocPDF, docPDFLineItemsTable, docPDFTotals } from '@shared/documents/pdfTemplate.ts';
import {
  fetchProposals, createProposal, updateProposal, deleteProposal, calcWinRate,
  fetchProposalLineItems, upsertProposalLineItems,
} from './proposalService.ts';
import { fetchClients } from '@hq/clients/clientService.ts';
import { _clients, _proposals, setClients, setProposals } from '@hq/core/state.ts';
import { toast, openModal, closeModal } from '@hq/core/ui.ts';
import type { Proposal, ProposalLineItem } from '@shared/types.ts';
import {
  proposalTableHTML, proposalFormHTML, proposalWinRateHTML, proposalValueSummaryHTML,
  quoLineRowHTML,
} from './proposals.templates.ts';

const gEl  = (id: string) => document.getElementById(id)!;

let _editingProposalId: number | null = null;

export async function loadProposals() {
  const [proposals, clients] = await Promise.all([fetchProposals(), fetchClients()]);
  setProposals(proposals);
  setClients(clients || []);
  renderProposals(_proposals);
}

export function renderProposals(proposals: Proposal[]) {
  const stats = calcWinRate(proposals);
  gEl('win-rate-pct').textContent              = stats.winRate + '%';
  gEl('win-rate-breakdown').innerHTML          = proposalWinRateHTML(stats);
  gEl('proposals-value-summary').innerHTML     = proposalValueSummaryHTML(stats);
  gEl('proposals-summary').textContent         = `${stats.total} proposals`;
  gEl('proposals-tbody').innerHTML             = proposalTableHTML(proposals);
}

export async function openAddProposal() {
  _editingProposalId = null;
  const quoNum = nextDocNumber('QUO', _proposals.map(p => p.quo_number ?? ''));
  const user   = await getCurrentUser();
  openModal(
    'New Quotation',
    proposalFormHTML(_clients, { quo_number: quoNum, status: 'Draft', prepared_by: user?.name ?? '' }, []),
    saveProposal,
  );
}

export async function openEditProposal(id: number) {
  const p = _proposals.find(x => x.id === id);
  if (!p) return;
  _editingProposalId = id;
  const items = await fetchProposalLineItems(id);
  openModal('Edit Quotation', proposalFormHTML(_clients, p, items), saveProposal);
}

export async function saveProposal() {
  const name = (document.getElementById('fp-name') as HTMLInputElement).value.trim();
  const err  = validateRequired(name, 'Proposal name');
  if (err) { toast(err, 'error'); return; }

  const quoNum = (document.getElementById('fp-quo-num') as HTMLInputElement).value.trim()
    || nextDocNumber('QUO', _proposals.map(p => p.quo_number ?? ''));

  const rows       = _collectQuoRows();
  const subtotal   = rows.reduce((s, r) => s + r.quantity * r.unit_price, 0);
  const vatAmount  = rows.reduce((s, r) => s + r.quantity * r.unit_price * (r.vat_rate / 100), 0);
  const totalAmount = subtotal + vatAmount;

  const payload: Partial<Proposal> = {
    name,
    quo_number:       quoNum,
    client:           (document.getElementById('fp-client')       as HTMLInputElement).value.trim()    || null,
    client_tin:       (document.getElementById('fp-client-tin')   as HTMLInputElement).value.trim()    || null,
    business_address: (document.getElementById('fp-biz-address')  as HTMLInputElement).value.trim()    || null,
    sent:             (document.getElementById('fp-sent')          as HTMLInputElement).value           || null,
    valid_until:      (document.getElementById('fp-valid-until')   as HTMLInputElement).value           || null,
    followup:         (document.getElementById('fp-followup')      as HTMLInputElement).value           || null,
    prepared_by:      (document.getElementById('fp-prepared-by')   as HTMLInputElement).value.trim()    || null,
    notes:            (document.getElementById('fp-notes')         as HTMLTextAreaElement).value.trim() || null,
    status:           (document.getElementById('fp-status')        as HTMLSelectElement).value,
    subtotal,
    vat_amount:  vatAmount,
    total_amount: totalAmount,
    value:       totalAmount || _proposals.find(p => p.id === _editingProposalId)?.value || 0,
  };

  const user  = await getCurrentUser();
  const actor = user?.name ?? user?.email ?? null;

  if (_editingProposalId) {
    const ok = await updateProposal(_editingProposalId, payload);
    if (!ok) { toast('Could not update proposal', 'error'); return; }
    await upsertProposalLineItems(_editingProposalId, rows);
    toast('Quotation updated', 'success');
    await logDocActivity('quotation', _editingProposalId, quoNum, 'updated', actor);
  } else {
    const result = await createProposal(payload);
    if (!result) { toast('Could not add quotation. Please try again.', 'error'); return; }
    await upsertProposalLineItems(result.id, rows);
    toast('Quotation created', 'success');
    await logDocActivity('quotation', result.id, quoNum, 'created', actor);
  }

  closeModal();
  loadProposals();
}

function _collectQuoRows(): ProposalLineItem[] {
  return Array.from(document.querySelectorAll<HTMLTableRowElement>('#quo-line-rows .quo-li-row'))
    .map(row => ({
      description: (row.querySelector('.quo-li-desc')  as HTMLInputElement).value.trim(),
      quantity:    parseFloat((row.querySelector('.quo-li-qty')   as HTMLInputElement).value) || 0,
      unit_price:  parseFloat((row.querySelector('.quo-li-price') as HTMLInputElement).value) || 0,
      vat_rate:    parseFloat((row.querySelector('.quo-li-vat')   as HTMLInputElement).value) || 0,
    }))
    .filter(r => r.description);
}

export function addQuoRow() {
  const tbody = document.getElementById('quo-line-rows');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = quoLineRowHTML().replace('<tr class="quo-li-row">', '').replace('</tr>', '');
  tr.className = 'quo-li-row';
  tbody.appendChild(tr);
  recalcQuo();
}

export function recalcQuo() {
  const rows = document.querySelectorAll<HTMLTableRowElement>('#quo-line-rows .quo-li-row');
  let subtotal = 0;
  let vat      = 0;

  rows.forEach(row => {
    const qty     = parseFloat((row.querySelector('.quo-li-qty')   as HTMLInputElement)?.value ?? '0') || 0;
    const price   = parseFloat((row.querySelector('.quo-li-price') as HTMLInputElement)?.value ?? '0') || 0;
    const vatRate = parseFloat((row.querySelector('.quo-li-vat')   as HTMLInputElement)?.value ?? '0') || 0;
    const lineAmt = qty * price;
    const lineVat = lineAmt * (vatRate / 100);
    subtotal += lineAmt;
    vat      += lineVat;
    const totalCell = row.querySelector('.quo-li-total');
    if (totalCell) totalCell.textContent = `₱${(lineAmt + lineVat).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
  });

  const total = subtotal + vat;
  const fmt = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
  const sub = document.getElementById('fq-subtotal'); if (sub) sub.textContent = fmt(subtotal);
  const v   = document.getElementById('fq-vat');       if (v)   v.textContent   = fmt(vat);
  const tot = document.getElementById('fq-total');     if (tot) tot.textContent = fmt(total);
}

export async function handleDeleteProposal(id: number) {
  if (!confirm('Delete this proposal? This cannot be undone.')) return;
  const ok = await deleteProposal(id);
  if (!ok) { toast('Could not delete proposal', 'error'); return; }
  toast('Proposal deleted', '');
  loadProposals();
}

export async function printQuotation(id: number) {
  const p = _proposals.find(x => x.id === id);
  if (!p) return;
  const { company } = APP_SETTINGS;
  const items = await fetchProposalLineItems(id);

  const docItems = items.map(i => ({
    description: i.description,
    quantity:    i.quantity,
    unit_price:  i.unit_price,
    vat_rate:    i.vat_rate,
  }));

  const subtotal    = p.subtotal    ?? p.value;
  const vatAmount   = p.vat_amount  ?? 0;
  const totalAmount = p.total_amount ?? p.value;

  const body = `
<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px">
  <div>
    <div class="label">Prepared For</div>
    <div class="value" style="font-weight:600">${escapeHtml(p.client ?? '—')}</div>
    ${p.client_tin       ? `<div class="label">TIN</div><div class="value">${escapeHtml(p.client_tin)}</div>` : ''}
    ${p.business_address ? `<div class="label">Address</div><div class="value">${escapeHtml(p.business_address)}</div>` : ''}
  </div>
  <div>
    ${p.sent        ? `<div class="label">Date Issued</div><div class="value">${p.sent}</div>` : ''}
    ${p.valid_until ? `<div class="label">Valid Until</div><div class="value">${p.valid_until}</div>` : ''}
  </div>
</div>
${docItems.length ? `<hr class="divider"/>${docPDFLineItemsTable(docItems)}<hr class="divider"/>` : ''}
${docPDFTotals({ subtotal, vat: vatAmount, total: totalAmount })}
${p.notes ? `<hr class="divider"/><div class="label">Notes / Terms</div><div class="value" style="white-space:pre-line">${escapeHtml(p.notes)}</div>` : ''}`;

  const html = buildDocPDF({
    title:       'QUOTATION',
    number:      p.quo_number ?? `QUO-${p.id}`,
    status:      p.status,
    statusClass: p.status === 'Won' ? 'paid' : p.status === 'Lost' || p.status === 'Expired' ? 'cancelled' : p.status === 'Sent' ? 'sent' : 'draft',
    company:     { name: company.name, address: company.address, email: company.email },
    body,
    sigLeft:  p.prepared_by ? { label: 'Prepared By', name: p.prepared_by } : { label: 'Prepared By' },
    sigRight: { label: 'Accepted By', name: '' },
    showTin:  true,
    showBanking: false,
  });

  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) { toast('Pop-up blocked — please allow pop-ups and try again', 'error'); return; }
  try {
    w.document.write(html);
    w.document.close();
    const user = await getCurrentUser();
    await logDocActivity('quotation', id, p.quo_number ?? null, 'downloaded', user?.name ?? user?.email ?? null);
  } catch (error) {
    console.error('printQuotation failed:', error);
    w.close();
    toast('Could not generate PDF. Please try again.', 'error');
  }
}
