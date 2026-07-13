// Creates a PayMongo Checkout Session for event ticket payment.
// PAYMONGO_SECRET_KEY and SUPABASE_SERVICE_ROLE_KEY must be set in Vercel env vars.
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secretKey) return res.status(503).json({ error: 'Payment service is not configured.' });
  if (!supabaseUrl || !serviceRoleKey) return res.status(503).json({ error: 'Database service is not configured.' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { eventId, registrationId, amount, description, successUrl, cancelUrl } = body ?? {};

  if (!registrationId || !amount || amount <= 0 || !successUrl || !cancelUrl) {
    return res.status(400).json({ error: 'registrationId, amount, successUrl, and cancelUrl are required' });
  }

  const amountCentavos = Math.round(amount * 100);
  const auth = Buffer.from(`${secretKey}:`).toString('base64');

  try {
    const pmRes = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
      },
      body: JSON.stringify({
        data: {
          attributes: {
            billing: { name: 'DestineVents Event Attendee' },
            line_items: [{
              currency: 'PHP',
              amount: amountCentavos,
              name: description || 'Event Ticket',
              quantity: 1,
            }],
            payment_method_types: ['gcash', 'card', 'paymaya', 'grab_pay'],
            success_url: successUrl,
            cancel_url: cancelUrl,
            description: description || 'Event Ticket',
            metadata: {
              type: 'event_ticket',
              event_id: String(eventId ?? ''),
              registration_id: String(registrationId),
            },
          },
        },
      }),
    });

    const pmData = await pmRes.json();

    if (!pmRes.ok) {
      const msg = pmData?.errors?.[0]?.detail || `PayMongo error ${pmRes.status}`;
      return res.status(pmRes.status).json({ error: msg });
    }

    const session = pmData.data;
    const checkoutUrl = session.attributes.checkout_url;
    const externalId = session.id;

    const sb = createClient(supabaseUrl, serviceRoleKey);
    const { data: payment, error: dbError } = await sb
      .from('payments')
      .insert({
        external_id: externalId,
        checkout_url: checkoutUrl,
        amount,
        currency: 'PHP',
        status: 'pending',
        type: 'event_ticket',
        reference_id: String(registrationId),
        metadata: { event_id: eventId, registration_id: registrationId },
      })
      .select()
      .single();

    if (dbError) {
      return res.status(500).json({ error: 'Checkout session created but could not save payment record.' });
    }

    await sb
      .from('event_registrations')
      .update({ payment_id: payment.id, payment_status: 'pending' })
      .eq('id', registrationId);

    return res.status(200).json({ checkoutUrl, paymentId: payment.id });
  } catch (e) {
    return res.status(500).json({ error: `Upstream error: ${e.message}` });
  }
};
