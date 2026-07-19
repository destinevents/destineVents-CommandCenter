import './authPage.ts';
import { sb } from '@shared/core/supabase';
import { signIn, signOut, getSession } from '@shared/core/authService.ts';
import { validateEmail } from '@shared/utils/validators.ts';
import { HQ_ROLES, ICC_ROLES } from '@config/roles.ts';
import type { UserRole } from '@shared/types';

const HQ_ROLE_SET  = new Set<string>(HQ_ROLES);
const ICC_ROLE_SET = new Set<string>(ICC_ROLES);

function setLoading(loading: boolean) {
  const btn = document.getElementById('login-btn') as HTMLButtonElement;
  btn.classList.toggle('btn-loading', loading);
  btn.disabled = loading;
}

function hideAllPanels() {
  ['login-form', 'forgot-form', 'role-picker', 'pending-screen'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function routeByRole(role: UserRole | string) {
  if (role === 'pending') {
    hideAllPanels();
    document.getElementById('pending-screen')!.style.display = 'block';
    return;
  }
  if (role === 'admin') {
    hideAllPanels();
    document.getElementById('role-picker')!.style.display = 'block';
    return;
  }
  if (HQ_ROLE_SET.has(role)) {
    window.location.href = 'index.html';
    return;
  }
  if (ICC_ROLE_SET.has(role)) {
    window.location.href = 'intern.html';
    return;
  }
  // Unknown role — fall back to pending screen rather than a blank state
  hideAllPanels();
  document.getElementById('pending-screen')!.style.display = 'block';
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
  hideAllPanels();
  document.getElementById('login-form')!.style.display = 'block';
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
