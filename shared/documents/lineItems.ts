// Shared line-item rules for the documents that are built from them —
// quotations and statements of billing today.
//
// Both used to keep a row only if it had a description, so a row carrying a
// quantity and a unit price but no wording was discarded on save. The document
// then totalled 0 and saved without complaint, and the zero followed it to the
// table, the stat cards and the client's PDF. Quotations were fixed first; the
// rule lives here so the SOB cannot drift away from it again.

// Structural on purpose: ProposalLineItem and SOBLineItem both satisfy it.
export interface PricedLineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

// A row counts as filled in if the person put anything on it at all — wording,
// or a figure.
export function isFilledLineItem(item: PricedLineItem): boolean {
  return !!item.description.trim() || item.quantity * item.unit_price > 0;
}

// Rows that carry money but no wording. These are kept rather than dropped, so
// the save can name what is missing instead of swallowing the figure.
export function itemsMissingDescription(items: PricedLineItem[]): PricedLineItem[] {
  return items.filter(i => !i.description.trim());
}
