function setLoading(loading) {
  const btn = document.getElementById('login-btn');
  const signupBtn = document.getElementById('signup-btn');
  if (loading) {
    btn.classList.add('btn-loading');
    btn.disabled = true;
    signupBtn.disabled = true;
  } else {
    btn.classList.remove('btn-loading');
    btn.disabled = false;
    signupBtn.disabled = false;
  }
}

function setSignUpLoading(loading) {
  const btn = document.getElementById('signup-btn');
  const loginBtn = document.getElementById('login-btn');
  if (loading) {
    btn.classList.add('btn-loading');
    btn.disabled = true;
    loginBtn.disabled = true;
  } else {
    btn.classList.remove('btn-loading');
    btn.disabled = false;
    loginBtn.disabled = false;
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
  try {
    const { data, error } = await signIn(email, pass);
    if (error) {
      errEl.textContent = error.message || 'Sign in failed. Please try again.';
      return;
    }
    const role = data?.user?.user_metadata?.role || 'intern';
    routeByRole(role);
  } finally {
    setLoading(false);
  }
}

async function handleSignUp() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  if (!email || !pass) { errEl.textContent = 'Email and password required.'; return; }
  setSignUpLoading(true);
  try {
    const { data, error } = await signUp(email, pass);
    if (error) {
      errEl.textContent = error.message || 'Sign up failed. Please try again.';
      return;
    }
    errEl.style.color = '#10b981';
    errEl.textContent = 'Account created! Check your email to confirm before signing in.';
  } finally {
    setSignUpLoading(false);
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
    const role = session.user.user_metadata?.role || 'intern';
    routeByRole(role);
  }
}

init();
