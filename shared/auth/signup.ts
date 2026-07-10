// Signup page entry module (Vite). Inline HTML handlers re-attached to window
// at the bottom. Role is NOT sent in metadata — the handle_new_user DB trigger
// hardcodes 'intern' (and authService.signUp strips role defensively anyway).
import './authPage.ts';
import { signUp } from '../services/authService.ts';
import { validatePassword } from './validation.ts';

function setLoading(loading: boolean) {
  const btn = document.getElementById('signup-btn') as HTMLButtonElement;
  if (loading) {
    btn.classList.add('btn-loading');
    btn.disabled = true;
  } else {
    btn.classList.remove('btn-loading');
    btn.disabled = false;
  }
}

async function handleSignUp() {
  const val = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
  const name = val('su-name').trim();
  const email = val('su-email').trim();
  const school = val('su-school').trim();
  const program = val('su-program').trim();
  const pass = val('su-pass');
  const errEl = document.getElementById('signup-error')!;
  errEl.style.color = '';
  errEl.textContent = '';

  if (!name) {
    errEl.textContent = 'Full name is required.';
    return;
  }
  if (!email) {
    errEl.textContent = 'Email is required.';
    return;
  }
  if (!school) {
    errEl.textContent = 'School is required.';
    return;
  }
  if (!program) {
    errEl.textContent = 'Program / Course is required.';
    return;
  }
  const pwErr = validatePassword(pass);
  if (pwErr) {
    errEl.textContent = pwErr;
    return;
  }

  setLoading(true);
  try {
    const { error } = await signUp(email, pass, { name, school, program });
    if (error) {
      errEl.textContent = (error as { message?: string }).message || 'Sign up failed. Please try again.';
      return;
    }
    errEl.style.color = '#10b981';
    errEl.textContent = 'Account created! Check your email to confirm, then sign in.';
    (document.getElementById('signup-btn') as HTMLButtonElement).disabled = true;
  } finally {
    setLoading(false);
  }
}

// Inline HTML handlers (onclick/onkeydown in signup.html) need globals.
Object.assign(window, { handleSignUp });
