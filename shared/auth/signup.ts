import './authPage.ts';
import { signUp } from '@shared/services/core/authService.ts';
import { validatePassword } from '../utils/validators.ts';
import { ICC_ROLES } from '../../config/roles.ts';
import type { UserRole } from '../types';

const ICC_ROLE_SET = new Set<string>(ICC_ROLES);

function gEl(id: string) {
  return document.getElementById(id)!;
}

function gVal(id: string): string {
  return (document.getElementById(id) as HTMLInputElement).value;
}

function setLoading(loading: boolean) {
  const btn = gEl('signup-btn') as HTMLButtonElement;
  btn.classList.toggle('btn-loading', loading);
  btn.disabled = loading;
}

function handleRoleChange() {
  const role = gVal('su-role');
  const iccFields = gEl('su-icc-fields');
  const isICC = ICC_ROLE_SET.has(role);
  iccFields.style.display = isICC ? '' : 'none';

  const subtitle = gEl('su-subtitle');
  const logoT2 = gEl('su-logo-t2');
  if (!role) {
    subtitle.textContent = 'Select your role to get started';
    logoT2.textContent = 'New Account';
  } else if (isICC) {
    subtitle.textContent = 'Intern Command Center access';
    logoT2.textContent = 'Intern Portal';
  } else {
    subtitle.textContent = 'HQ portal access';
    logoT2.textContent = 'HQ Portal';
  }
}

async function handleSignUp() {
  const role = gVal('su-role').trim() as UserRole;
  const name = gVal('su-name').trim();
  const email = gVal('su-email').trim();
  const school = gVal('su-school').trim();
  const program = gVal('su-program').trim();
  const pass = gVal('su-pass');
  const errEl = gEl('signup-error');
  errEl.style.color = '';
  errEl.textContent = '';

  if (!role) {
    errEl.textContent = 'Please select a role.';
    return;
  }
  if (!name) {
    errEl.textContent = 'Full name is required.';
    return;
  }
  if (!email) {
    errEl.textContent = 'Email is required.';
    return;
  }
  const isICC = ICC_ROLE_SET.has(role);
  if (isICC && !school) {
    errEl.textContent = 'School is required.';
    return;
  }
  if (isICC && !program) {
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
    const meta: Record<string, string | null> = {
      name,
      requested_role: role,
      school: isICC ? school : null,
      program: isICC ? program : null,
    };
    const { error } = await signUp(email, pass, meta);
    if (error) {
      errEl.textContent = (error as { message?: string }).message || 'Sign up failed. Please try again.';
      return;
    }
    errEl.style.color = '#10b981';
    errEl.textContent =
      'Account created — your access is pending review. Jenn will assign your role. You can sign in once approved.';
    (gEl('signup-btn') as HTMLButtonElement).disabled = true;
  } finally {
    setLoading(false);
  }
}

Object.assign(window, { handleSignUp, handleRoleChange });

// Set initial state in case browser restores a previous selection
handleRoleChange();
