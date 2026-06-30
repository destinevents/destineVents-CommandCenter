async function signUp(email, password, meta = {}) {
  try {
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: meta }
    });
    if (error) return { data: null, error };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

async function signIn(email, password) {
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { data: null, error };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

async function signOut() {
  const { error } = await sb.auth.signOut();
  if (error) logger.error('authService.signOut', error.message, error);
}

async function getSession() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    return session;
  } catch (err) {
    logger.error('authService.getSession', err.message, err);
    return null;
  }
}

async function refreshSession() {
  try {
    const { data, error } = await sb.auth.refreshSession();
    if (error) logger.warn('authService.refreshSession', error.message);
    return data;
  } catch (err) {
    logger.error('authService.refreshSession', err.message, err);
    return null;
  }
}

async function getProfile(userId) {
  const { data, error } = await sb.from('intern_users').select('*').eq('id', userId).single();
  if (error) { logger.warn('authService.getProfile', error.message); return null; }
  return data;
}

async function getCurrentUser() {
  const session = await getSession();
  if (!session?.user) return null;
  const profile = await getProfile(session.user.id);
  return {
    ...session.user,
    ...(profile || {}),
    id: session.user.id,
    name: profile?.name || session.user.user_metadata?.name || null,
    role: session.user.user_metadata?.role || profile?.role || ROLES.INTERN,
  };
}

async function getAuthUser() {
  try {
    const { data: { user } } = await sb.auth.getUser();
    return user;
  } catch (err) {
    logger.error('authService.getAuthUser', err.message, err);
    return null;
  }
}

async function updateProfile(userId, updates) {
  try {
    const { error: dbErr } = await sb.from('intern_users')
      .update(updates)
      .eq('id', userId);
    if (dbErr) return { error: dbErr };

    const { error: metaErr } = await sb.auth.updateUser({ data: updates });
    if (metaErr) return { error: metaErr };

    return { error: null };
  } catch (err) {
    return { error: err };
  }
}

async function updatePassword(email, currentPassword, newPassword) {
  try {
    // Verify current password by re-authenticating
    const { error: authErr } = await sb.auth.signInWithPassword({ email, password: currentPassword });
    if (authErr) return { error: { message: 'Current password is incorrect.' } };

    const { error: updateErr } = await sb.auth.updateUser({ password: newPassword });
    if (updateErr) return { error: updateErr };

    return { error: null };
  } catch (err) {
    return { error: err };
  }
}
