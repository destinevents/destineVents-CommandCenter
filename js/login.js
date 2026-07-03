function setLoading(loading) {
  const btn = document.getElementById('login-btn');
  if (loading) {
    btn.classList.add('btn-loading');
    btn.disabled = true;
  } else {
    btn.classList.remove('btn-loading');
    btn.disabled = false;
  }
}

function routeByRole(role) {
  if (role === 'admin') {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('role-picker').style.display = 'block';
  } else {
    window.location.href = 'intern.html';
  }
}

function goHQ() {
  window.location.href = 'index.html';
}

function goIntern() {
  window.location.href = 'intern.html';
}

async function handleSignIn() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  if (!email || !pass) {
    errEl.textContent = 'Email and password required.';
    return;
  }
  setLoading(true);
  try {
    const { data, error } = await signIn(email, pass);
    if (error) {
      errEl.textContent = error.message || 'Sign in failed. Please try again.';
      return;
    }
    if (!data.user) {
      errEl.textContent = 'Sign in failed. Please verify your email and try again.';
      return;
    }
    const { data: profile } = await sb
      .from('intern_users')
      .select('role')
      .eq('id', data.user.id)
      .single();
    const role = profile?.role || 'intern';
    routeByRole(role);
  } finally {
    setLoading(false);
  }
}

async function handleSignOut() {
  await signOut();
  document.getElementById('login-form').style.display = 'block';
  document.getElementById('role-picker').style.display = 'none';
  document.getElementById('login-error').textContent = '';
}

async function init() {
  const session = await getSession();
  if (session) {
    const { data: profile, error: profileError } = await sb
      .from('intern_users')
      .select('role')
      .eq('id', session.user.id)
      .single();
    if (profileError || !profile) {
      document.getElementById('login-error').textContent =
        'Could not verify your account. Please sign in again.';
      return;
    }
    routeByRole(profile.role);
  }
}

init();
