import { escapeHtml } from '@shared/utils/helpers.ts'
import { formatCurrency } from '@shared/utils/formatUtils.ts'
import { formatDateShort } from '@shared/utils/dateUtils.ts'

// ── Types ────────────────────────────────────────────────────────────────────

export interface DocLineItem {
  description: string
  quantity: number
  unit_price: number
  vat_rate: number
}

export interface DocCompany {
  name: string
  address: string
  email?: string
  tin?: string
  bankAccountName?: string
  bankAccountNumber?: string
}

export interface DocSignature {
  label: string
  name?: string   // pre-filled name; omit for blank signature line
}

export interface DocPDFOptions {
  /** Document type label shown top-right e.g. "STATEMENT OF BILLING" */
  title: string
  /** Document number e.g. "SOB-2026-001" */
  number: string
  /** Status text e.g. "Draft", "Paid" */
  status: string
  /** CSS class suffix for the status badge e.g. "paid", "draft" */
  statusClass: string
  /** Company details shown in the letterhead */
  company: DocCompany
  /** Middle section HTML (meta grid, line items, amounts, notes) */
  body: string
  /** Left signature block */
  sigLeft?: DocSignature
  /** Right signature block */
  sigRight?: DocSignature
  /** Whether to show bank details below the company address */
  showBanking?: boolean
  /** Show TIN line below company address */
  showTin?: boolean
}

// ── Shared CSS ───────────────────────────────────────────────────────────────

export function docPDFCSS(): string {
  return `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;background:#fff;padding:48px}
  .brand{font-size:28px;font-weight:700;letter-spacing:-0.5px}
  .brand span{font-weight:300;color:#666}
  .tagline{font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#888;margin-top:3px}
  .doc-title{font-size:22px;font-weight:600;color:#999;text-align:right}
  .doc-num{font-size:30px;font-weight:700;text-align:right;letter-spacing:-0.5px}
  .label{font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#888;margin-bottom:3px}
  .value{font-size:13px;color:#1a1a1a;margin-bottom:10px}
  .divider{border:none;border-top:1px solid #e8e3da;margin:20px 0}
  table.items{width:100%;border-collapse:collapse;margin:20px 0}
  table.items thead th{background:#f5f0e8;padding:8px 10px;text-align:left;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#666}
  table.items thead th:not(:first-child){text-align:right}
  table.items tbody td{padding:8px 10px;border-bottom:1px solid #e8e3da}
  table.items tbody td:not(:first-child){text-align:right}
  table.pay-table{width:100%;border-collapse:collapse;margin:8px 0}
  table.pay-table td{padding:8px 12px;border-bottom:1px solid #e8e3da;font-size:13px}
  table.pay-table td:last-child{text-align:right;font-weight:500}
  .section-head{background:#f5f0e8;padding:6px 12px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#666;margin-top:16px}
  .total-row{display:flex;justify-content:space-between;font-size:13px;padding:4px 0}
  .total-final{font-size:20px;font-weight:700;border-top:2px solid #1a1a1a;padding-top:10px;margin-top:8px;display:flex;justify-content:space-between}
  .net-box{background:#f5f9f2;border:1px solid #c8e6c9;border-radius:8px;padding:20px 24px;margin:24px 0;text-align:center}
  .net-amount{font-size:36px;font-weight:700;color:#1a7a45;margin-top:8px}
  .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase}
  .badge-draft{background:#f5f0e8;color:#666}
  .badge-sent{background:#dbeafe;color:#1e40af}
  .badge-paid{background:#d4f5e2;color:#1a7a45}
  .badge-unpaid{background:#fef3c7;color:#92400e}
  .badge-overdue{background:#fee2e2;color:#991b1b}
  .badge-approved{background:#dbeafe;color:#1d4ed8}
  .badge-for-approval{background:#fef3c7;color:#92400e}
  .badge-pending{background:#f3f4f6;color:#6b7280}
  .badge-cancelled{background:#f3f4f6;color:#9ca3af}
  .badge-signed{background:#d4f5e2;color:#1a7a45}
  .badge-fulfilled{background:#d4f5e2;color:#1a7a45}
  .sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:48px;margin-top:48px}
  .sig-line{border-top:1px solid #1a1a1a;padding-top:8px;font-size:11px;color:#888;margin-top:48px}
  .footer{margin-top:48px;padding-top:18px;border-top:1px solid #e8e3da;font-size:10px;color:#aaa;text-align:center;line-height:1.8}
  @media print{body{padding:24px}.no-print{display:none}}`
}

// ── Header ───────────────────────────────────────────────────────────────────

export function docPDFHeader(opts: DocPDFOptions): string {
  const { company, title, number, status, statusClass, showBanking, showTin } = opts
  const bankingLine = showBanking && company.bankAccountName
    ? `<br>${escapeHtml(company.bankAccountName)}<br>BPI Account: ${escapeHtml(company.bankAccountNumber ?? '')}`
    : ''
  const tinLine = (showTin || showBanking) && company.tin
    ? `<br>TIN: ${escapeHtml(company.tin)}`
    : ''

  return `
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px">
  <div>
    <div class="brand">destine<span>vents</span></div>
    <div class="tagline">${escapeHtml(company.name)}</div>
    <div style="font-size:11px;color:#888;margin-top:8px;line-height:1.7">
      ${escapeHtml(company.address)}${tinLine}${bankingLine}
    </div>
  </div>
  <div style="text-align:right">
    <div class="doc-title">${escapeHtml(title)}</div>
    <div class="doc-num">${escapeHtml(number)}</div>
    <div style="margin-top:8px">
      <span class="badge badge-${escapeHtml(statusClass)}">${escapeHtml(status)}</span>
    </div>
  </div>
</div>`
}

// ── Line Items Table ──────────────────────────────────────────────────────────

export function docPDFLineItemsTable(items: DocLineItem[]): string {
  const rows = items.length
    ? items.map(li => {
        const lineAmt = li.quantity * li.unit_price * (1 + li.vat_rate / 100)
        return `<tr>
          <td>${escapeHtml(li.description)}</td>
          <td>${li.quantity}</td>
          <td>${formatCurrency(li.unit_price)}</td>
          <td>${li.vat_rate}%</td>
          <td style="font-weight:600">${formatCurrency(lineAmt)}</td>
        </tr>`
      }).join('')
    : `<tr><td colspan="5" style="color:#888">—</td></tr>`

  return `
<table class="items">
  <thead><tr>
    <th style="width:45%">Description</th>
    <th style="width:10%">Qty</th>
    <th style="width:15%">Unit Price</th>
    <th style="width:10%">VAT</th>
    <th style="width:20%">Amount</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>`
}

// ── Totals Block ──────────────────────────────────────────────────────────────

export interface DocTotalsOptions {
  subtotal: number
  vat?: number
  discount?: number
  ewtRate?: string
  ewtAmount?: number
  total: number
  totalLabel?: string
}

export function docPDFTotals(opts: DocTotalsOptions): string {
  const { subtotal, vat = 0, discount = 0, ewtRate, ewtAmount = 0, total, totalLabel = 'Total Due' } = opts
  return `
<div style="display:flex;justify-content:flex-end">
  <div style="width:280px">
    <div class="total-row"><span style="color:#888">Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
    ${vat > 0 ? `<div class="total-row"><span style="color:#888">VAT</span><span>${formatCurrency(vat)}</span></div>` : ''}
    ${discount > 0 ? `<div class="total-row"><span style="color:#888">Discount</span><span>-${formatCurrency(discount)}</span></div>` : ''}
    ${ewtAmount > 0 ? `<div class="total-row"><span style="color:#888">EWT Deduction (${escapeHtml(ewtRate ?? '')})</span><span style="color:#c0392b">- ${formatCurrency(ewtAmount)}</span></div>` : ''}
    <div class="total-final"><span>${escapeHtml(totalLabel)}</span><span>${formatCurrency(total)}</span></div>
  </div>
</div>`
}

// ── Signature Block ───────────────────────────────────────────────────────────

export function docPDFSignatureBlock(left: DocSignature, right: DocSignature): string {
  const sigSlot = (sig: DocSignature) => `
  <div>
    <div class="label">${escapeHtml(sig.label)}</div>
    <div class="sig-line">${sig.name ? escapeHtml(sig.name) : ''}</div>
    ${!sig.name ? `<div style="font-size:11px;color:#888;margin-top:6px">Signature / Name</div>` : ''}
  </div>`

  return `<div class="sig-grid">${sigSlot(left)}${sigSlot(right)}</div>`
}

// ── Footer ────────────────────────────────────────────────────────────────────

export function docPDFFooter(company: DocCompany): string {
  const emailPart = company.email ? ` · ${escapeHtml(company.email)}` : ''
  return `
<div class="no-print" style="margin-top:28px">
  <button onclick="window.print()" style="padding:8px 20px;background:#1a1a1a;color:#fff;border:none;border-radius:4px;font-size:13px;cursor:pointer">Print / Save as PDF</button>
</div>
<div class="footer">
  ${escapeHtml(company.name)} · ${escapeHtml(company.address)}${emailPart}<br>
  Thank you for your trust and partnership.
</div>`
}

// ── Main Builder ──────────────────────────────────────────────────────────────

/**
 * Assembles a complete printable HTML document from shared parts.
 * Pass `body` as the middle section (meta grid + amounts/line items + notes + signature block).
 */
export function buildDocPDF(opts: DocPDFOptions): string {
  const sig = opts.sigLeft && opts.sigRight
    ? docPDFSignatureBlock(opts.sigLeft, opts.sigRight)
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${escapeHtml(opts.title)} ${escapeHtml(opts.number)}</title>
<style>${docPDFCSS()}</style>
</head>
<body>
${docPDFHeader(opts)}
${opts.body}
${sig}
${docPDFFooter(opts.company)}
</body>
</html>`
}

// ── Date helper (re-exported for convenience) ─────────────────────────────────

export { formatDateShort }
