// Creates a PayMongo Payment Link for invoice payment.
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

  const { invoiceId, amount, description } = body ?? {};

  if (!invoiceId || !amount || amount <= 0) {
    return res.status(400).json({ error: 'invoiceId and amount are required' });
  }

  const amountCentavos = Math.round(amount * 100);
  const auth = Buffer.from(`${secretKey}:`).toString('base64');

  try {
    const pmRes = await fetch('https://api.paymongo.com/v1/links', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
      },
      body: JSON.stringify({
        data: {
          attributes: {
            amount: amountCentavos,
            description: description || `Invoice payment — DestineVents`,
            remarks: `Invoice ID: ${invoiceId}`,
          },
        },
      }),
    });

    const pmData = await pmRes.json();

    if (!pmRes.ok) {
      const msg = pmData?.errors?.[0]?.detail || `PayMongo error ${pmRes.status}`;
      return res.status(pmRes.status).json({ error: msg });
    }

    const link = pmData.data;
    const paymentUrl = link.attributes.checkout_url;
    const linkId = link.id;

    const sb = createClient(supabaseUrl, serviceRoleKey);
    const { data: payment, error: dbError } = await sb
      .from('payments')
      .insert({
        external_id: linkId,
        checkout_url: paymentUrl,
        amount,
        currency: 'PHP',
        status: 'pending',
        type: 'invoice',
        reference_id: String(invoiceId),
        metadata: { invoice_id: invoiceId },
      })
      .select()
      .single();

    if (dbError) {
      return res.status(500).json({ error: 'Payment link created but could not save payment record.' });
    }

    await sb
      .from('invoices')
      .update({
        payment_id: payment.id,
        payment_url: paymentUrl,
        paymongo_link_id: linkId,
      })
      .eq('id', invoiceId);

    return res.status(200).json({ paymentUrl, paymentId: payment.id });
  } catch (e) {
    return res.status(500).json({ error: `Upstream error: ${e.message}` });
  }
};
