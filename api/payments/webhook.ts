// PayMongo webhook handler — verifies signature and updates payment status.
// PAYMONGO_WEBHOOK_SECRET and SUPABASE_SERVICE_ROLE_KEY must be set in Vercel env vars.
// Disable body parser to get raw body for signature verification.
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!webhookSecret) return res.status(503).json({ error: 'Webhook not configured.' });
  if (!supabaseUrl || !serviceRoleKey) return res.status(503).json({ error: 'Database not configured.' });

  const rawBody = await getRawBody(req);
  const sigHeader = req.headers['paymongo-signature'] ?? '';

  if (!verifySignature(rawBody, sigHeader, webhookSecret)) {
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const eventType = event?.data?.attributes?.type;
  const eventData = event?.data?.attributes?.data;

  const sb = createClient(supabaseUrl, serviceRoleKey);

  try {
    if (eventType === 'checkout_session.payment.paid') {
      await handleCheckoutPaid(sb, eventData);
    } else if (eventType === 'link.payment.paid') {
      await handleLinkPaid(sb, eventData);
    } else if (eventType === 'payment.failed') {
      await handlePaymentFailed(sb, eventData);
    }
  } catch (e) {
    return res.status(500).json({ error: `Handler error: ${e.message}` });
  }

  return res.status(200).json({ received: true });
};

module.exports.config = { api: { bodyParser: false } };

// Exported for tests. Vercel only reads the handler itself and `config`, so
// extra properties on the exported function are inert in production.
module.exports.linkPaymentDetails = linkPaymentDetails;
module.exports.postInvoiceToLedger = postInvoiceToLedger;
module.exports.handleLinkPaid = handleLinkPaid;

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function verifySignature(rawBody, sigHeader, secret) {
  // Format: t=TIMESTAMP,te=TEST_SIG,li=LIVE_SIG
  const parts = Object.fromEntries(
    sigHeader.split(',').map(part => part.split('='))
  );
  const timestamp = parts['t'];
  const testSig   = parts['te'];
  const liveSig   = parts['li'];

  if (!timestamp || (!testSig && !liveSig)) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const computed = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  return computed === testSig || computed === liveSig;
}

async function handleCheckoutPaid(sb, sessionData) {
  const externalId = sessionData?.id;
  if (!externalId) return;

  const { data: payment } = await sb
    .from('payments')
    .update({ status: 'paid', updated_at: new Date().toISOString() })
    .eq('external_id', externalId)
    .eq('type', 'event_ticket')
    .select()
    .single();

  if (payment?.reference_id) {
    await sb
      .from('event_registrations')
      .update({ payment_status: 'paid' })
      .eq('id', payment.reference_id);
  }
}

// PayMongo reports how the client actually paid (gcash, card, grab_pay …) on the
// payment record attached to the link. Fall back to a generic label rather than
// leaving the Official Receipt blank.
function linkPaymentDetails(linkData) {
  const payments = linkData?.attributes?.payments;
  const first = Array.isArray(payments) ? payments[0] : null;
  const attrs = first?.data?.attributes ?? first?.attributes ?? {};
  const sourceType = attrs?.source?.type ?? null;
  const method = sourceType
    ? `PayMongo (${String(sourceType).replace(/_/g, ' ')})`
    : 'PayMongo';
  return { method, reference: first?.data?.id ?? first?.id ?? linkData?.id ?? null };
}

async function handleLinkPaid(sb, linkData) {
  const externalId = linkData?.id;
  if (!externalId) return;

  const { data: payment } = await sb
    .from('payments')
    .update({ status: 'paid', updated_at: new Date().toISOString() })
    .eq('external_id', externalId)
    .eq('type', 'invoice')
    .select()
    .single();

  if (!payment?.reference_id) return;

  const invoiceId = Number(payment.reference_id);
  const { method, reference } = linkPaymentDetails(linkData);
  const paidOn = new Date().toISOString().slice(0, 10);

  // Marking the invoice Paid is not enough on its own: without the payment
  // details the Official Receipt prints blank rows, and without a Cash Ledger
  // row the whole Finance dashboard behaves as if the money never arrived.
  const { data: invoice } = await sb
    .from('invoices')
    .update({
      status:            'Paid',
      payment_date:      paidOn,
      payment_method:    method,
      payment_reference: reference,
      received_by:       'PayMongo (online payment)',
    })
    .eq('id', invoiceId)
    .select()
    .single();

  if (invoice) await postInvoiceToLedger(sb, invoice);
}

// Server-side mirror of syncInvoiceToLedger (apps/hq/finance/ar/ar.ts). The
// browser helper cannot be reused here — it runs on the anon-key client and
// reads window state — so the field values below are kept deliberately identical
// to it. That way, if someone later edits this invoice in the app, the
// client-side sync computes the same row and leaves it alone instead of
// rewriting it.
async function postInvoiceToLedger(sb, invoice) {
  // Idempotent: PayMongo retries webhooks, and a retry must not double-count.
  const { data: existing } = await sb
    .from('cash_ledger')
    .select('id')
    .eq('source_type', 'invoice')
    .eq('source_id', invoice.id);

  if (existing && existing.length > 0) return;

  const { data: accounts, error: acctError } = await sb
    .from('financial_accounts')
    .select('*')
    .order('created_at', { ascending: true });

  if (acctError) throw new Error(`Could not read financial accounts: ${acctError.message}`);

  const account = (accounts ?? []).find(a => a.is_default && a.is_active)
    ?? (accounts ?? []).find(a => a.is_default)
    ?? (accounts ?? []).find(a => a.is_active)
    ?? null;

  if (!account) {
    // Nothing to post into. Retrying will not fix this — someone has to add an
    // account under Finance → Settings — so let the webhook succeed rather than
    // have PayMongo retry until it gives up. Re-saving the invoice in the app
    // posts it once an account exists.
    console.error(
      `Invoice ${invoice.id} paid online but NOT posted to the Cash Ledger: ` +
      'no financial account exists. Add one under Finance → Settings, then ' +
      'reopen and save the invoice.',
    );
    return;
  }

  const { error } = await sb.from('cash_ledger').insert({
    reference_no:   invoice.or_num ?? null,
    txn_date:       invoice.payment_date ?? invoice.date ?? null,
    description:    `Client payment — ${invoice.client ?? 'Invoice'}${invoice.or_num ? ` (${invoice.or_num})` : ''}`,
    project_id:     invoice.project_id ?? null,
    category:       'Client Payment',
    module_source:  'AR',
    payment_method: invoice.payment_method ?? null,
    account_id:     account.id,
    cash_in:        invoice.amount,
    cash_out:       0,
    created_by:     invoice.received_by ?? null,
    source_type:    'invoice',
    source_id:      invoice.id,
  });

  // Throwing here returns a 500 so PayMongo retries — safe, because the
  // existence check above makes a second attempt a no-op.
  if (error) throw new Error(`Could not post invoice ${invoice.id} to ledger: ${error.message}`);
}

async function handlePaymentFailed(sb, paymentData) {
  const metadata = paymentData?.attributes?.metadata ?? {};
  const externalId = paymentData?.id;
  if (!externalId) return;

  await sb
    .from('payments')
    .update({ status: 'failed', updated_at: new Date().toISOString() })
    .eq('external_id', externalId);

  if (metadata.registration_id) {
    await sb
      .from('event_registrations')
      .update({ payment_status: 'failed' })
      .eq('id', metadata.registration_id);
  }
}
