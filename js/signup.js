function setLoading(loading) {
  const btn = document.getElementById('signup-btn');
  if (loading) {
    btn.classList.add('btn-loading');
    btn.disabled = true;
  } else {
    btn.classList.remove('btn-loading');
    btn.disabled = false;
  }
}

async function handleSignUp() {
  const name    = document.getElementById('su-name').value.trim();
  const email   = document.getElementById('su-email').value.trim();
  const school  = document.getElementById('su-school').value.trim();
  const program = document.getElementById('su-program').value.trim();
  const pass    = document.getElementById('su-pass').value;
  const errEl   = document.getElementById('signup-error');
  errEl.style.color = '';
  errEl.textContent = '';

  if (!name)    { errEl.textContent = 'Full name is required.'; return; }
  if (!email)   { errEl.textContent = 'Email is required.'; return; }
  if (!school)  { errEl.textContent = 'School is required.'; return; }
  if (!program) { errEl.textContent = 'Program / Course is required.'; return; }
  if (!pass)    { errEl.textContent = 'Password is required.'; return; }
  if (pass.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; return; }

  setLoading(true);
  try {
    const { data, error } = await signUp(email, pass, { name, school, program, role: 'intern' });
    if (error) {
      errEl.textContent = error.message || 'Sign up failed. Please try again.';
      return;
    }
    errEl.style.color = '#10b981';
    errEl.textContent = 'Account created! Check your email to confirm, then sign in.';
    document.getElementById('signup-btn').disabled = true;
  } finally {
    setLoading(false);
  }
}
