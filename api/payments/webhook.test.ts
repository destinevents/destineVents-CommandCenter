// Covers the part of the PayMongo webhook that touches the books: an invoice
// paid online must record how it was paid AND post a Cash Ledger row, or the
// money is invisible everywhere in Finance.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import webhook from './webhook.ts';

const { linkPaymentDetails, postInvoiceToLedger, handleLinkPaid } = webhook as unknown as {
  linkPaymentDetails: (linkData: unknown) => { method: string; reference: string | null };
  postInvoiceToLedger: (sb: unknown, invoice: unknown) => Promise<void>;
  handleLinkPaid: (sb: unknown, linkData: unknown) => Promise<void>;
};

// ── Minimal Supabase stub ─────────────────────────────────────────────────────
// Records every insert/update so tests can assert on what reached the database.

interface StubOptions {
  ledgerRows?: unknown[];
  accounts?: unknown[];
  payment?: unknown;
  invoice?: unknown;
  insertError?: { message: string } | null;
}

function makeSb(options: StubOptions = {}) {
  const inserts: Record<string, unknown[]> = {};
  const updates: Record<string, unknown[]> = {};

  const sb = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      const self = () => chain;

      chain.select = self;
      chain.eq = self;
      chain.order = self;

      chain.insert = (row: unknown) => {
        (inserts[table] ??= []).push(row);
        return Promise.resolve({ data: null, error: options.insertError ?? null });
      };

      chain.update = (row: unknown) => {
        (updates[table] ??= []).push(row);
        return chain;
      };

      chain.single = () => Promise.resolve({
        data: table === 'payments' ? options.payment ?? null : options.invoice ?? null,
        error: null,
      });

      // Awaiting the chain resolves to the table's read result.
      chain.then = (resolve: (v: unknown) => unknown) => {
        const data = table === 'cash_ledger' ? options.ledgerRows ?? []
          : table === 'financial_accounts' ? options.accounts ?? []
            : [];
        return Promise.resolve({ data, error: null }).then(resolve);
      };

      return chain;
    },
    inserts,
    updates,
  };

  return sb;
}

const INVOICE = {
  id: 7, or_num: 'INV-2026-004', client: 'Acme Corp', amount: 25000,
  project_id: 3, date: '2026-08-01', payment_date: '2026-08-07',
  payment_method: 'PayMongo (gcash)', received_by: 'PayMongo (online payment)',
};

const ACTIVE_ACCOUNT = { id: 11, name: 'BPI', is_default: true, is_active: true };

beforeEach(() => vi.clearAllMocks());

describe('linkPaymentDetails', () => {
  it('names the actual channel the client paid through', () => {
    const out = linkPaymentDetails({
      id: 'link_1',
      attributes: { payments: [{ data: { id: 'pay_9', attributes: { source: { type: 'gcash' } } } }] },
    });
    expect(out).toEqual({ method: 'PayMongo (gcash)', reference: 'pay_9' });
  });

  it('turns underscored source types into readable text', () => {
    const out = linkPaymentDetails({
      id: 'link_1',
      attributes: { payments: [{ data: { id: 'pay_9', attributes: { source: { type: 'grab_pay' } } } }] },
    });
    expect(out.method).toBe('PayMongo (grab pay)');
  });

  it('falls back to a generic label and the link id when the payload is bare', () => {
    expect(linkPaymentDetails({ id: 'link_1' })).toEqual({
      method: 'PayMongo', reference: 'link_1',
    });
  });
});

describe('postInvoiceToLedger', () => {
  it('posts a cash-in row matching what the app would have written', async () => {
    const sb = makeSb({ accounts: [ACTIVE_ACCOUNT] });
    await postInvoiceToLedger(sb, INVOICE);

    expect(sb.inserts.cash_ledger).toEqual([{
      reference_no: 'INV-2026-004',
      txn_date: '2026-08-07',
      description: 'Client payment — Acme Corp (INV-2026-004)',
      project_id: 3,
      category: 'Client Payment',
      module_source: 'AR',
      payment_method: 'PayMongo (gcash)',
      account_id: 11,
      cash_in: 25000,
      cash_out: 0,
      created_by: 'PayMongo (online payment)',
      source_type: 'invoice',
      source_id: 7,
    }]);
  });

  it('does not post twice when PayMongo retries the webhook', async () => {
    const sb = makeSb({ ledgerRows: [{ id: 1 }], accounts: [ACTIVE_ACCOUNT] });
    await postInvoiceToLedger(sb, INVOICE);
    expect(sb.inserts.cash_ledger).toBeUndefined();
  });

  it('prefers the default account over a merely active one', async () => {
    const sb = makeSb({
      accounts: [
        { id: 1, is_default: false, is_active: true },
        { id: 2, is_default: true, is_active: true },
      ],
    });
    await postInvoiceToLedger(sb, INVOICE);
    expect((sb.inserts.cash_ledger?.[0] as { account_id: number }).account_id).toBe(2);
  });

  it('gives up quietly when no financial account exists, since retrying cannot help', async () => {
    const sb = makeSb({ accounts: [] });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(postInvoiceToLedger(sb, INVOICE)).resolves.toBeUndefined();

    expect(sb.inserts.cash_ledger).toBeUndefined();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('no financial account'));
    spy.mockRestore();
  });

  it('throws on a database error so PayMongo retries the delivery', async () => {
    const sb = makeSb({ accounts: [ACTIVE_ACCOUNT], insertError: { message: 'timeout' } });
    await expect(postInvoiceToLedger(sb, INVOICE)).rejects.toThrow(/timeout/);
  });
});

describe('handleLinkPaid', () => {
  it('records the payment details on the invoice, not just the Paid status', async () => {
    const sb = makeSb({
      payment: { id: 'p1', reference_id: '7' },
      invoice: INVOICE,
      accounts: [ACTIVE_ACCOUNT],
    });

    await handleLinkPaid(sb, {
      id: 'link_1',
      attributes: { payments: [{ data: { id: 'pay_9', attributes: { source: { type: 'gcash' } } } }] },
    });

    expect(sb.updates.invoices?.[0]).toEqual({
      status: 'Paid',
      payment_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      payment_method: 'PayMongo (gcash)',
      payment_reference: 'pay_9',
      received_by: 'PayMongo (online payment)',
    });
    expect(sb.inserts.cash_ledger).toHaveLength(1);
  });

  it('ignores a link that is not tied to an invoice', async () => {
    const sb = makeSb({ payment: { id: 'p1', reference_id: null } });
    await handleLinkPaid(sb, { id: 'link_1' });
    expect(sb.updates.invoices).toBeUndefined();
    expect(sb.inserts.cash_ledger).toBeUndefined();
  });
});
