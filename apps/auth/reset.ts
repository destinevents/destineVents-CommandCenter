// Password reset landing page (Vite entry module). The email link carries a
// recovery token in the URL hash; supabase-js parses it into a session when
// the shared client (shared/services/supabase.ts) is created, which is what
// authorizes the updatePassword call below.
import './authPage.ts';
import { sb } from '@shared/core/supabase';
import { signOut, getSession, updatePassword } from '@shared/core/authService.ts';
import { validatePassword } from '@shared/utils/validators.ts';

function setResetError(msg: string, ok?: boolean) {
  const errEl = document.getElementById('reset-error')!;
  errEl.style.color = ok ? 'var(--green, #10b981)' : '';
  errEl.textContent = msg;
}

async function handleReset() {
  const pwd = (document.getElementById('reset-pass') as HTMLInputElement).value;
  const confirm = (document.getElementById('reset-confirm') as HTMLInputElement).value;
  setResetError('');

  // Same 5-rule policy as signup and the account page
  const pwErr = validatePassword(pwd);
  if (pwErr) { setResetError(pwErr); return; }
  if (pwd !== confirm) { setResetError('Passwords do not match.'); return; }

  const btn = document.getElementById('reset-btn') as HTMLButtonElement;
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

// Warn if the page was opened without a valid recovery link. The token
// exchange is async and can be slow on a bad connection, so listen for the
// session instead of racing a short timer — and clear the warning if the
// session shows up late.
let recoverySessionSeen = false;
sb.auth.onAuthStateChange((_event, session) => {
  if (session) {
    recoverySessionSeen = true;
    setResetError('');
  }
});
setTimeout(async () => {
  if (recoverySessionSeen) return;
  const session = await getSession();
  if (!session) {
    setResetError('This reset link is invalid or has expired. Request a new one from the sign-in page.');
  }
}, 5000);

// Inline HTML handlers (onclick/onkeydown in reset-password.html) need globals.
Object.assign(window, { handleReset });
