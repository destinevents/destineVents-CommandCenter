// Login page entry module (Vite). The HTML keeps its inline onclick handlers,
// so every handler referenced there is re-attached to window at the bottom —
// module scope does not leak globals the way classic scripts did.
import './authPage.ts';
import { sb } from '../services/supabase';
import { signIn, signOut, getSession } from '../services/authService.ts';
import { validateEmail } from '../utils/validators.ts';

function setLoading(loading: boolean) {
  const btn = document.getElementById('login-btn') as HTMLButtonElement;
  if (loading) {
    btn.classList.add('btn-loading');
    btn.disabled = true;
  } else {
    btn.classList.remove('btn-loading');
    btn.disabled = false;
  }
}

function routeByRole(role: string) {
  if (role === 'admin') {
    document.getElementById('login-form')!.style.display = 'none';
    document.getElementById('role-picker')!.style.display = 'block';
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

function shakeInputs() {
  ['login-email', 'login-pass'].forEach(id => {
    const el = document.getElementById(id)!;
    el.classList.remove('shake');
    void (el as HTMLElement).offsetWidth; // force reflow so re-adding re-triggers
    el.classList.add('shake');
    el.addEventListener('animationend', () => el.classList.remove('shake'), { once: true });
  });
}

async function handleSignIn() {
  const email = (document.getElementById('login-email') as HTMLInputElement).value.trim();
  const pass = (document.getElementById('login-pass') as HTMLInputElement).value;
  const errEl = document.getElementById('login-error')!;
  errEl.textContent = '';
  if (!email || !pass) {
    errEl.textContent = 'Email and password required.';
    return;
  }
  setLoading(true);
  try {
    const { data, error } = await signIn(email, pass);
    if (error) {
      errEl.textContent = (error as { message?: string }).message || 'Sign in failed. Please try again.';
      shakeInputs();
      return;
    }
    if (!data?.user) {
      errEl.textContent = 'Sign in failed. Please verify your email and try again.';
      shakeInputs();
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

function showForgot(show: boolean) {
  const login  = document.getElementById('login-form')!;
  const forgot = document.getElementById('forgot-form')!;
  login.style.display  = show ? 'none' : 'block';
  forgot.style.display = show ? 'block' : 'none';
  // Replay entrance animation on the newly-shown form
  const visible = show ? forgot : login;
  visible.classList.remove('auth-form-state');
  void visible.offsetWidth;
  visible.classList.add('auth-form-state');
  document.getElementById('login-error')!.textContent = '';
  document.getElementById('forgot-error')!.textContent = '';
}

function checkEmail(input: HTMLInputElement) {
  const valid = document.getElementById('login-email-valid');
  if (!valid) return;
  const ok = validateEmail(input.value) === null;
  valid.classList.toggle('show', ok);
}

function togglePassword(inputId: string, btn: HTMLElement) {
  const input = document.getElementById(inputId) as HTMLInputElement;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.classList.toggle('active', show);
}

async function handleForgot() {
  const email = (document.getElementById('forgot-email') as HTMLInputElement).value.trim();
  const errEl = document.getElementById('forgot-error')!;
  errEl.textContent = '';
  if (!email) {
    errEl.textContent = 'Email is required.';
    return;
  }
  const btn = document.getElementById('forgot-btn') as HTMLButtonElement;
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
  document.getElementById('login-form')!.style.display = 'block';
  document.getElementById('role-picker')!.style.display = 'none';
  document.getElementById('login-error')!.textContent = '';
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
      document.getElementById('login-error')!.textContent =
        'Could not verify your account. Please sign in again.';
      return;
    }
    routeByRole(profile.role);
  }
}

// Inline HTML handlers (onclick/onkeydown/oninput in login.html) need globals.
Object.assign(window, {
  handleSignIn, handleForgot, handleSignOut,
  showForgot, checkEmail, togglePassword, goHQ, goIntern,
});

init();
