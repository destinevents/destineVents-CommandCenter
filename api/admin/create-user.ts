// Creates a user account and emails them an invite to set their own password.
//
// WHY THIS IS SERVER-SIDE: intern_users.id is a foreign key to auth.users, so a
// person cannot be added to the roster without a real auth account, and
// creating auth accounts requires the Supabase service-role key. That key must
// never reach the browser — it bypasses every RLS policy in the database.
//
// SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_URL must be set in Vercel env vars.
const { createClient } = require('@supabase/supabase-js');

// Roles an admin may hand out here. 'admin' is deliberately excluded — a second
// admin should be a deliberate database action, not a form submission. 'pending'
// is excluded because it is a waiting state, not something you assign.
const ASSIGNABLE_ROLES = [
  'intern', 'supervisor',
  'freelancer', 'team_staff', 'finance_officer', 'external_accountant',
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    if (error || !data?.user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    callerId = data.user.id;
  } catch {
    return res.status(401).json({ error: 'Could not verify your session.' });
  }

  const { data: caller, error: callerErr } = await admin
    .from('intern_users')
    .select('role')
    .eq('id', callerId)
    .single();

  if (callerErr || !caller) {
    return res.status(403).json({ error: 'Your account was not found.' });
  }
  if (caller.role !== 'admin') {
    return res.status(403).json({ error: 'Only an admin can add users.' });
  }

  // ── 2. Validate the request ────────────────────────────────────────────────
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const name = String(body?.name ?? '').trim();
  const email = String(body?.email ?? '').trim().toLowerCase();
  const role = String(body?.role ?? '').trim();
  const school = String(body?.school ?? '').trim();
  const program = String(body?.program ?? '').trim();
  const requiredHoursRaw = body?.required_hours;

  if (!name) return res.status(400).json({ error: 'Name is required.' });
  if (name.length > 120) return res.status(400).json({ error: 'Name is too long.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!ASSIGNABLE_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Pick a valid role.' });
  }

  let requiredHours = null;
  if (requiredHoursRaw !== undefined && requiredHoursRaw !== null && requiredHoursRaw !== '') {
    requiredHours = Number(requiredHoursRaw);
    if (!Number.isInteger(requiredHours) || requiredHours < 0 || requiredHours > 10000) {
      return res.status(400).json({ error: 'Required hours must be a whole number between 0 and 10000.' });
    }
  }

  // ── 3. Create the account and send the invite ──────────────────────────────
  // inviteUserByEmail creates the auth user and emails a link — the person sets
  // their own password, so no admin ever handles someone else's credentials.
  const origin = req.headers.origin || `https://${req.headers.host}`;

  let newUserId;
  try {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { name, requested_role: role, school: school || null, program: program || null },
      redirectTo: `${origin}/reset-password.html`,
    });

    if (error) {
      const msg = String(error.message || '');
      if (/already|registered|exists/i.test(msg)) {
        return res.status(409).json({
          error: 'That email already has an account. Change their role from the Users list instead.',
        });
      }
      // Supabase's built-in mailer allows only a couple of emails an hour, and
      // says so in developer shorthand. Nobody using this form can act on
      // "email rate limit exceeded" — say what it means and what fixes it.
      if (/rate limit|too many/i.test(msg)) {
        return res.status(429).json({
          error: 'The email service has hit its hourly limit, so no invite was sent. '
               + 'Try again in an hour, or set up custom SMTP in Supabase to lift the limit. '
               + 'If a retry says the email already has an account, remove it from the Users list first.',
        });
      }
      return res.status(400).json({ error: msg || 'Could not send the invite.' });
    }
    newUserId = data?.user?.id;
  } catch (e) {
    return res.status(500).json({ error: `Could not create the account: ${e.message}` });
  }

  if (!newUserId) {
    return res.status(500).json({ error: 'Account was created but no id came back. Check the Users list before retrying.' });
  }

  // ── 4. Apply the role the admin chose ──────────────────────────────────────
  // The signup trigger (migration 017/018) creates every new row as 'pending'.
  // That is correct for self-registration, but an admin adding someone has
  // already made the decision — so promote the row straight away.
  const { error: roleErr } = await admin
    .from('intern_users')
    .update({
      role,
      requested_role: null,
      name,
      school: school || null,
      program: program || null,
      ...(requiredHours !== null ? { required_hours: requiredHours } : {}),
    })
    .eq('id', newUserId);

  if (roleErr) {
    // The invite already went out, so don't pretend this failed entirely —
    // tell the admin exactly what to fix.
    return res.status(500).json({
      error: `Invite sent, but the role could not be set (${roleErr.message}). Set it from the Users list.`,
      partial: true,
      id: newUserId,
    });
  }

  return res.status(200).json({ id: newUserId, name, email, role });
};
