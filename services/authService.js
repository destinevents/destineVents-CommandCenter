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
    role: session.user.user_metadata?.role || profile?.role || ROLES.INTERN,
  };
}
