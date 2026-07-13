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

  if (payment?.reference_id) {
    await sb
      .from('invoices')
      .update({ status: 'Paid' })
      .eq('id', payment.reference_id);
  }
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
