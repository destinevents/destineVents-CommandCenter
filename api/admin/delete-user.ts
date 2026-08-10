// Permanently removes a person's account.
//
// WHY THIS IS SERVER-SIDE: deleting the row in intern_users would leave an
// orphaned auth.users record, and that email could never be re-invited. The
// real delete has to happen in auth.users — which needs the Supabase
// service-role key, and that key must never reach the browser. intern_users.id
// is declared "references auth.users(id) on delete cascade" (migration 002),
// so removing the auth user takes the roster row, and everything keyed to it,
// with it.
//
// SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_URL must be set in Vercel env vars.
const { createClient } = require('@supabase/supabase-js');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(503).json({ error: 'User service is not configured.' });
  }

  // ── 1. Who is asking? ──────────────────────────────────────────────────────
  // Never trust a role sent by the client. Verify the caller's token, then read
  // their real role from the database.
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Not signed in.' });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let callerId;
  try {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    }
    callerId = data.user.id;
  } catch {
    return res.status(401).json({ error: 'Could not verify your session.' });
  }

  const { data: caller, error: callerErr } = await admin
    .from('intern_users')
    .select('role')
    .eq('id', callerId)
    .single();

  if (callerErr || !caller) return res.status(403).json({ error: 'Your account was not found.' });
  if (caller.role !== 'admin') return res.status(403).json({ error: 'Only an admin can remove users.' });

  // ── 2. Validate the target ─────────────────────────────────────────────────
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const id = String(body?.id ?? '').trim();
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'A valid user id is required.' });

  // Deleting yourself would lock the last admin out of the system entirely.
  if (id === callerId) {
    return res.status(400).json({ error: 'You cannot remove your own account.' });
  }

  const { data: target, error: targetErr } = await admin
    .from('intern_users')
    .select('name, email, role')
    .eq('id', id)
    .single();

  if (targetErr || !target) return res.status(404).json({ error: 'That user no longer exists.' });

  // Admins are granted by hand in SQL, so they are removed by hand too — this
  // endpoint must not become a way for one admin to lock out another.
  if (target.role === 'admin') {
    return res.status(403).json({ error: 'Admin accounts must be removed directly in Supabase.' });
  }

  // ── 3. Delete ──────────────────────────────────────────────────────────────
  try {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) {
      return res.status(500).json({ error: `Could not remove the account: ${error.message}` });
    }
  } catch (e) {
    return res.status(500).json({ error: `Could not remove the account: ${e.message}` });
  }

  return res.status(200).json({ id, name: target.name, email: target.email });
};
