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
    const { data: profile, error: profileError } = await sb
      .from('intern_users')
      .select('role')
      .eq('id', data.user.id)
      .single();
    if (profileError || !profile) {
      errEl.textContent = 'Could not verify your account. Please try again.';
      return;
    }
    routeByRole(profile.role);
  } finally {
    setLoading(false);
  }
}

function showForgot(show) {
  document.getElementById('login-form').style.display = show ? 'none' : 'block';
  document.getElementById('forgot-form').style.display = show ? 'block' : 'none';
  document.getElementById('login-error').textContent = '';
  document.getElementById('forgot-error').textContent = '';
}

async function handleForgot() {
  const email = document.getElementById('forgot-email').value.trim();
  const errEl = document.getElementById('forgot-error');
  errEl.textContent = '';
  if (!email) {
    errEl.textContent = 'Email is required.';
    return;
  }
  const btn = document.getElementById('forgot-btn');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  try {
    await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password.html`,
    });
    // Always show the same message so the form can't be used to probe
    // which emails have accounts
    errEl.style.color = 'var(--green, #10b981)';
    errEl.textContent = 'If that email has an account, a reset link is on its way. Check your inbox.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send Reset Link';
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
