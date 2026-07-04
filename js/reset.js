// Password reset landing page. The email link carries a recovery token in the
// URL hash; supabase-js parses it into a session when the client in js/auth.js
// is created, which is what authorizes the updatePassword call below.

function setResetError(msg, ok) {
  const errEl = document.getElementById('reset-error');
  errEl.style.color = ok ? 'var(--green, #10b981)' : '';
  errEl.textContent = msg;
}

async function handleReset() {
  const pwd = document.getElementById('reset-pass').value;
  const confirm = document.getElementById('reset-confirm').value;
  setResetError('');

  if (pwd.length < 8) { setResetError('Password must be at least 8 characters.'); return; }
  if (pwd !== confirm) { setResetError('Passwords do not match.'); return; }

  const btn = document.getElementById('reset-btn');
  btn.disabled = true;
  btn.textContent = 'Updating…';
  try {
    const { error } = await updatePassword(pwd);
    if (error) {
      setResetError(error.message || 'Could not update password. The link may have expired — request a new one.');
      return;
    }
    setResetError('Password updated! Taking you to sign in…', true);
    await signOut();
    setTimeout(() => { window.location.href = 'login.html'; }, 1800);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Update Password';
  }
}

// Warn early if the page was opened without a valid recovery link. The token
// exchange is async, so give supabase-js a moment before judging.
setTimeout(async () => {
  const session = await getSession();
  if (!session) {
    setResetError('This reset link is invalid or has expired. Request a new one from the sign-in page.');
  }
}, 1500);
