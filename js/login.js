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
  if (!email || !pass) { errEl.textContent = 'Email and password required.'; return; }
  setLoading(true);
  const { data, error } = await signIn(email, pass);
  setLoading(false);
  if (error) { errEl.textContent = error.message; return; }
  await refreshSession();
  const session = await getSession();
  const role = session?.user?.user_metadata?.role || 'intern';
  routeByRole(role);
}

async function handleSignOut() {
  await signOut();
  document.getElementById('login-form').style.display = 'block';
  document.getElementById('role-picker').style.display = 'none';
  document.getElementById('login-error').textContent = '';
}

async function init() {
  await refreshSession();
  const session = await getSession();
  if (session) {
    const role = session.user.user_metadata?.role || 'intern';
    routeByRole(role);
  }
}

init();
