// Vercel serverless function — proxies AI requests to Anthropic.
// ANTHROPIC_API_KEY must be set in Vercel environment variables.
// Run locally with: npm run dev:full (uses vercel dev, not vite)
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'AI service is not configured. Set ANTHROPIC_API_KEY in Vercel environment variables.' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!body?.model || !Array.isArray(body?.messages) || !body.messages.length) {
    return res.status(400).json({ error: 'Request must include model and messages[]' });
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      body.model,
        max_tokens: body.max_tokens || 1024,
        messages:   body.messages,
      }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      const msg = data?.error?.message || data?.error || `Anthropic API error ${upstream.status}`;
      return res.status(upstream.status).json({ error: msg });
    }

    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: `Upstream error: ${e.message}` });
  }
};
