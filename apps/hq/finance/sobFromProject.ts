// What a statement of billing inherits when it is raised from a project, and
// when billing one moves it along the pipeline. Pure — no DOM, no Supabase.

import type { Project, ProposalLineItem, SOBLineItem } from '@shared/types.ts';
import { localISODate } from '@shared/utils/dateUtils.ts';
import { APP_SETTINGS } from '@config/settings.ts';

// A project reaches billing by winning a quotation that was already itemised,
// so those lines are the statement's lines. Where there is no quotation behind
// it — or one written before line items existed — the project bills as a single
// line, which still leaves the statement itemised so the invoice converted from
// it inherits something rather than nothing.
export function sobLineItemsFor(project: Project, quoted: ProposalLineItem[]): SOBLineItem[] {
  const usable = quoted.filter(q => (q.description ?? '').trim() !== '' || q.unit_price > 0);
  if (usable.length)
    return usable.map(({ description, quantity, unit_price, vat_rate }) => ({
      description, quantity, unit_price, vat_rate,
    }));

  return [{
    description: project.name,
    quantity: 1,
    unit_price: project.value || 0,
    vat_rate: 0,
  }];
}

// Only a project waiting to be billed advances. One already further along —
// invoiced, paid, receipted — must not be walked backwards by a second
// statement, and one that never entered the pipeline is not ours to move.
export function shouldAdvanceOnBilling(project: Project | undefined): project is Project {
  return project?.status === 'Proposal Approved';
}

export function dueDateFrom(issueISO: string, days = APP_SETTINGS.finance.paymentTermDays): string {
  const d = new Date(issueISO);
  if (isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return localISODate(d);
}

// The same bank details on every statement, from settings rather than memory.
export function defaultPaymentInstructions(): string {
  const b = APP_SETTINGS.banking;
  if (!b.bpiAccountName || !b.bpiAccountNumber) return '';
  return [b.bpiAccountName, b.bpiBranch, b.bpiAccountNumber].filter(Boolean).join(' · ');
}
