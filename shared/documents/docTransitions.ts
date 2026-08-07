// Which status a document is allowed to move to next.
//
// THE AUTHORITY IS THE DATABASE: `database/schema/hq/documents/doc-state-machine.sql`
// installs BEFORE UPDATE triggers that reject anything not listed there, raising
// `Invalid <Label> status transition: <from> → <to>`. This file mirrors those rules
// so the interface can stop *offering* moves that were always going to be refused.
// If you change one, change the other — they are a pair.
//
// Pure and DOM-free, like arCalc.ts and ledgerCalc.ts, so it is trivially testable.

export type DocKind =
  | 'quotation' | 'sob' | 'invoice' | 'payroll' | 'bill' | 'po' | 'contract';

// from → the statuses reachable from it. A status absent from a map is terminal.
const TRANSITIONS: Record<DocKind, Record<string, readonly string[]>> = {
  quotation: {
    Draft: ['Sent', 'Lost', 'Expired'],
    Sent:  ['Won', 'Lost', 'Expired'],
  },
  sob: {
    Draft:            ['Sent', 'Cancelled'],
    Sent:             ['Viewed', 'Partially Paid', 'Paid', 'Cancelled'],
    Viewed:           ['Partially Paid', 'Paid', 'Cancelled'],
    'Partially Paid': ['Paid', 'Cancelled'],
  },
  invoice: {
    Draft:  ['Issued', 'Cancelled'],
    Issued: ['Paid', 'Cancelled'],
  },
  payroll: {
    Draft:   ['Pending'],
    Pending: ['Paid'],
    // Paid → Pending exists so a wrongly-released payslip can be corrected; the
    // Cash Ledger reversal is already handled in savePayroll. Requires
    // database/schema/hq/documents/payroll-allow-unpay.sql to have been applied.
    Paid:    ['Pending'],
  },
  bill: {
    Pending:        ['For Approval', 'Cancelled'],
    'For Approval': ['Approved', 'Rejected', 'Cancelled'],
    Approved:       ['Paid', 'Cancelled'],
    Rejected:       ['Pending'],
  },
  po: {
    Draft:    ['Sent', 'Cancelled'],
    Sent:     ['Approved', 'Cancelled'],
    Approved: ['Fulfilled', 'Cancelled'],
  },
  contract: {
    Draft:  ['Sent', 'Terminated'],
    Sent:   ['Signed', 'Terminated'],
    Signed: ['Active', 'Terminated'],
    Active: ['Completed', 'Terminated'],
  },
};

// Canonical display order, so a filtered dropdown still reads in lifecycle order
// rather than however the transition map happened to be written.
const STATUS_ORDER: Record<DocKind, readonly string[]> = {
  quotation: ['Draft', 'Sent', 'Won', 'Lost', 'Expired'],
  sob:       ['Draft', 'Sent', 'Viewed', 'Partially Paid', 'Paid', 'Cancelled'],
  invoice:   ['Draft', 'Issued', 'Paid', 'Cancelled'],
  payroll:   ['Draft', 'Pending', 'Paid'],
  bill:      ['Pending', 'For Approval', 'Approved', 'Rejected', 'Paid', 'Cancelled'],
  po:        ['Draft', 'Sent', 'Approved', 'Fulfilled', 'Cancelled'],
  contract:  ['Draft', 'Sent', 'Signed', 'Active', 'Completed', 'Terminated'],
};

// How the database names each document in its error text, and how we name it to
// a person. 'SOB' is what the trigger says; "billing statement" is what a
// bookkeeper calls it.
const DB_LABEL: Record<DocKind, string> = {
  quotation: 'Quotation', sob: 'SOB', invoice: 'Invoice', payroll: 'Payroll',
  bill: 'Bill', po: 'PO', contract: 'Contract',
};

const HUMAN_NOUN: Record<DocKind, string> = {
  quotation: 'quotation', sob: 'billing statement', invoice: 'invoice',
  payroll: 'payroll record', bill: 'expense', po: 'purchase order',
  contract: 'contract',
};

export function nextStatuses(kind: DocKind, from: string): readonly string[] {
  return TRANSITIONS[kind][from] ?? [];
}

// Saving a document without touching its status is always fine — the triggers
// return early when old and new match — so treat that as allowed.
export function canTransition(kind: DocKind, from: string, to: string): boolean {
  if (from === to) return true;
  return nextStatuses(kind, from).includes(to);
}

// What an edit form's status dropdown should offer: where it is now, plus
// everywhere it can legally go. Ordered by lifecycle.
export function statusOptions(kind: DocKind, current: string): string[] {
  const allowed = new Set<string>([current, ...nextStatuses(kind, current)]);
  const ordered = STATUS_ORDER[kind].filter(s => allowed.has(s));
  // A legacy value that predates the current lifecycle (e.g. an old 'Unpaid'
  // invoice) is not in STATUS_ORDER. Keep it so the dropdown still shows where
  // the document actually is rather than silently changing it on save.
  return ordered.includes(current) ? ordered : [current, ...ordered];
}

function kindFromLabel(label: string): DocKind | null {
  const entry = (Object.keys(DB_LABEL) as DocKind[]).find(k => DB_LABEL[k] === label);
  return entry ?? null;
}

// Turn the database's `Invalid Invoice status transition: Draft → Paid` into
// something a bookkeeper can act on. Returns null for any unrelated error so the
// caller can fall back to its normal message.
export function explainTransitionError(message: string): string | null {
  const match = /Invalid (.+?) status transition:\s*(.+?)\s*(?:→|->)\s*(.+?)\s*$/.exec(message);
  if (!match) return null;

  const [, label, from, to] = match;
  const kind = kindFromLabel(label);
  const noun = kind ? HUMAN_NOUN[kind] : 'document';
  const article = /^[aeiou]/i.test(noun) ? 'An' : 'A';
  const opening = `${article} ${noun} cannot go straight from ${from} to ${to}.`;

  if (!kind) return opening;

  const options = nextStatuses(kind, from);
  if (options.length === 0) return `${opening} ${from} is the end of the line.`;

  return `${opening} From ${from} it can only become ${listPhrase(options)}.`;
}

function listPhrase(items: readonly string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}
