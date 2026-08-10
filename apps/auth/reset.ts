// Password landing page (Vite entry module). Reached two ways:
//
//   type=invite   — an admin added this person; they are choosing their FIRST
//                   password. They have no working credentials until they do,
//                   so this page must not offer a way out.
//   type=recovery — an existing user forgot their password.
//
// Either link carries a token in the URL hash, which supabase-js trades for a
// session when the shared client is created — that session is what authorises
// the updatePassword call below.
import './authPage.ts';
import { sb } from '@shared/core/supabase';
import { signOut, getSession, updatePassword } from '@shared/core/authService.ts';
import { validatePassword } from '@shared/utils/validators.ts';

// Captured by the inline script in reset-password.html before supabase-js
// clears the hash; the live hash is only a fallback for direct navigation.
const linkType =
  (window as unknown as { __authLinkType?: string }).__authLinkType ||
  new URLSearchParams(window.location.hash.slice(1)).get('type') ||
  '';

const isInvite = linkType === 'invite' || linkType === 'signup';

function el(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function setResetError(msg: string, ok?: boolean) {
  const errEl = el('reset-error');
  if (!errEl) return;
  errEl.style.color = ok ? 'var(--green, #10b981)' : '';
  errEl.textContent = msg;
}

/** Re-words the page for someone who has never had a password on this account. */
function applyInviteCopy() {
  const copy: Record<string, string> = {
    'reset-heading': 'Set your password.',
    'reset-sub': 'Choose a password to finish setting up your account',
    'reset-pass-label': 'Password',
    'reset-confirm-label': 'Confirm Password',
    'reset-btn': 'Set Password & Continue',
  };
  Object.entries(copy).forEach(([id, text]) => {
    const node = el(id);
    if (node) node.textContent = text;
  });
  // Removing the escape hatch is the point: this is the only path in.
  const back = el('reset-back-btn');
  if (back) back.remove();
  document.title = 'Set Your Password — DestineVents';
}

async function handleReset() {
  const pwd = (el('reset-pass') as HTMLInputElement).value;
  const confirm = (el('reset-confirm') as HTMLInputElement).value;
  setResetError('');

  // Same 5-rule policy as signup and the account page
  const pwErr = validatePassword(pwd);
  if (pwErr) { setResetError(pwErr); return; }
  if (pwd !== confirm) { setResetError('Passwords do not match.'); return; }

  const btn = el('reset-btn') as HTMLButtonElement;
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = isInvite ? 'Setting…' : 'Updating…';
  try {
    const { error } = await updatePassword(pwd);
    if (error) {
      setResetError(error.message || 'Could not save your password. The link may have expired — request a new one.');
      btn.disabled = false;
      btn.textContent = originalLabel;
      return;
    }
    await finishReset();
  } catch (err) {
    setResetError(`Could not save your password: ${(err as Error).message || 'unknown error'}`);
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

/**
 * An invited person keeps the session they just authenticated with and goes
 * straight to their portal — signing them out here would dump them at a login
 * screen holding a password they have typed exactly once.
 * A password reset still signs out, so any other device using the old password
 * is forced to re-authenticate.
 */
async function finishReset() {
  if (isInvite) {
    setResetError('Password set! Taking you in…', true);
    setTimeout(() => { window.location.href = 'login.html'; }, 1200);
    return;
  }
  setResetError('Password updated! Taking you to sign in…', true);
  await signOut();
  setTimeout(() => { window.location.href = 'login.html'; }, 1800);
}

// Warn if the page was opened without a valid link. The token exchange is async
// and can be slow on a bad connection, so listen for the session instead of
// racing a short timer — and clear the warning if the session shows up late.
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
    setResetError(
      isInvite
        ? 'This invite link is invalid or has expired. Ask your admin to send a new one.'
        : 'This reset link is invalid or has expired. Request a new one from the sign-in page.'
    );
  }
}, 5000);

if (isInvite) applyInviteCopy();

// Inline HTML handlers (onclick/onkeydown in reset-password.html) need globals.
Object.assign(window, { handleReset });
