// Finance Overview presentation. Pure string builders — no state, no Supabase.
//
// The page answers three questions in order: what needs chasing today, where
// the business stands right now, and how this month compares. Everything else
// — the year, all time, founder capital — is kept but demoted, because it is
// reference material rather than something anyone acts on at a glance.

import type { FinanceSummary } from '@shared/types.ts';
import { escapeHtml } from '@shared/utils/helpers.ts';
import { formatCurrency } from '@shared/utils/formatUtils.ts';

export type Tone = 'good' | 'bad' | 'flat';

// ── Movement against the previous period ─────────────────────────────────────

// Colour follows what the movement means, not which way it points: expenses
// climbing is not the good news that revenue climbing is. A figure with no
// comparison is close to meaningless on a dashboard, which is what every card
// here used to be.
export function deltaHTML(
  current: number,
  previous: number,
  opts: { higherIsBetter: boolean; periodLabel: string },
): string {
  const { higherIsBetter, periodLabel } = opts;
  const vs = `vs ${escapeHtml(periodLabel)}`;

  if (previous === 0 && current === 0)
    return `<div class="stat-change is-flat">No activity ${vs}</div>`;

  if (previous === 0) {
    const tone: Tone = higherIsBetter ? 'good' : 'bad';
    return `<div class="stat-change is-${tone}">First activity since ${escapeHtml(periodLabel)}</div>`;
  }

  const pct = Math.round(((current - previous) / Math.abs(previous)) * 100);
  if (pct === 0) return `<div class="stat-change is-flat">Level ${vs}</div>`;

  const rising = pct > 0;
  const tone: Tone = rising === higherIsBetter ? 'good' : 'bad';
  return `<div class="stat-change is-${tone}">${rising ? '▲' : '▼'} ${Math.abs(pct)}% ${vs}</div>`;
}

// ── Cards ────────────────────────────────────────────────────────────────────

export interface KpiCard {
  label: string;
  value: number;
  sub?: string;              // plain text, escaped here
  extra?: string;            // pre-built markup, e.g. deltaHTML
  color?: string;
  tab?: string;              // finance tab this card stands for, if any
}

// A card only takes the hover and the cursor when it actually goes somewhere.
// Every card used to light up under the pointer and none of them were
// clickable, which is a promise the page could not keep.
export function kpiCardHTML(c: KpiCard, size: 'hero' | 'normal' = 'normal'): string {
  const cls   = `stat-card kpi-card${size === 'hero' ? ' is-hero' : ''}${c.tab ? ' is-link' : ''}`;
  const attrs = c.tab
    ? ` role="button" tabindex="0" onclick="showFinanceTab('${c.tab}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();showFinanceTab('${c.tab}')}"`
    : '';
  return `<div class="${cls}"${attrs}>
    <div class="stat-label">${escapeHtml(c.label)}</div>
    <div class="stat-value"${c.color ? ` style="color:${c.color}"` : ''}>${formatCurrency(c.value)}</div>
    ${c.sub ? `<div class="stat-change is-flat">${escapeHtml(c.sub)}</div>` : ''}
    ${c.extra ?? ''}
  </div>`;
}

export function kpiRowHTML(label: string, cards: KpiCard[], size: 'hero' | 'normal' = 'normal'): string {
  return `<div class="kpi-row-label">${escapeHtml(label)}</div>
    <div class="kpi-row${size === 'hero' ? ' is-hero' : ''}">${cards.map(c => kpiCardHTML(c, size)).join('')}</div>`;
}

// ── What needs chasing ───────────────────────────────────────────────────────

export interface AttentionItem {
  text: string;
  amount: number;
  tab: string;
  tone: 'bad' | 'warn';
}

export function attentionItems(summary: FinanceSummary): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (summary.overdueCount > 0)
    items.push({
      text: `${summary.overdueCount} overdue invoice${summary.overdueCount !== 1 ? 's' : ''}`,
      amount: summary.overdueTotal, tab: 'receivables', tone: 'bad',
    });
  if (summary.pendingBillsCount > 0)
    items.push({
      text: `${summary.pendingBillsCount} bill${summary.pendingBillsCount !== 1 ? 's' : ''} to pay`,
      amount: summary.apOutstanding, tab: 'payables', tone: 'warn',
    });
  if (summary.payrollDue > 0)
    items.push({ text: 'Payroll pending', amount: summary.payrollDue, tab: 'payroll', tone: 'warn' });
  return items;
}

// The overview's first row, and the only part of it that asks for a decision.
// An all-clear says so rather than leaving the reader to infer it from three
// figures that happen to be zero.
export function attentionBandHTML(summary: FinanceSummary): string {
  const items = attentionItems(summary);
  if (!items.length)
    return `<div class="attn-band is-clear">Nothing needs chasing — no overdue invoices, unpaid bills, or payroll due.</div>`;

  return `<div class="attn-band">${items.map(i => `
    <button type="button" class="attn-chip is-${i.tone}" onclick="showFinanceTab('${i.tab}')">
      <span class="attn-dot"></span>
      <span class="attn-text">${escapeHtml(i.text)}</span>
      <span class="attn-amount">${formatCurrency(i.amount)}</span>
      <span class="attn-go" aria-hidden="true">→</span>
    </button>`).join('')}</div>`;
}

// ── The demoted figures ──────────────────────────────────────────────────────

export interface DetailColumn {
  title: string;
  rows: { label: string; value: string; color?: string }[];
}

// Reference figures as rows rather than cards. As cards they carried the same
// visual weight as the cash balance, so the page had thirteen equally loud
// answers and no obvious place to start reading.
export function detailStripHTML(columns: DetailColumn[]): string {
  return `<div class="detail-strip">${columns.map(col => `
    <div class="detail-col">
      <div class="detail-col-title">${escapeHtml(col.title)}</div>
      ${col.rows.map(r => `
        <div class="detail-row">
          <span class="detail-label">${escapeHtml(r.label)}</span>
          <span class="detail-value"${r.color ? ` style="color:${r.color}"` : ''}>${escapeHtml(r.value)}</span>
        </div>`).join('')}
    </div>`).join('')}</div>`;
}

// Shown in place of a wall of ₱0 before any money has been recorded.
export function ledgerEmptyHintHTML(): string {
  return `<div class="kpi-empty-hint">
    No cash ledger entries yet — revenue, expenses and cash position fill in as payments are recorded.
  </div>`;
}
