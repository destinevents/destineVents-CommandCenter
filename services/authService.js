async function signIn(email, password) {
  return sb.auth.signInWithPassword({ email, password });
}

async function signOut() {
  return sb.auth.signOut();
}

async function getSession() {
  const { data: { session } } = await sb.auth.getSession();
  return session;
}

async function refreshSession() {
  return sb.auth.refreshSession();
}

async function getProfile(userId) {
  return sb.from('intern_users').select('*').eq('id', userId).single();
}
