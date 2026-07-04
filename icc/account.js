const PW_RULES = [
  { id: 'req-len',     test: p => p.length >= 8,             label: 'Minimum 8 characters' },
  { id: 'req-upper',   test: p => /[A-Z]/.test(p),           label: 'At least one uppercase letter' },
  { id: 'req-lower',   test: p => /[a-z]/.test(p),           label: 'At least one lowercase letter' },
  { id: 'req-num',     test: p => /[0-9]/.test(p),           label: 'At least one number' },
  { id: 'req-special', test: p => /[^A-Za-z0-9]/.test(p),   label: 'At least one special character' },
];

function pwField(id, placeholder) {
  return `<div class="pw-wrap">
              <input class="form-input" id="${id}" type="password" placeholder="${placeholder}"/>
              <button type="button" class="pw-toggle-btn" data-target="${id}">Show</button>
            </div>`;
}

async function renderAccount() {
  const el = document.getElementById('page-account');
  const isStaff = ['admin', 'supervisor'].includes(currentUser.role);

  const infoRows = [
    ['Full Name',    currentUser.name    || '—'],
    ['Email',        currentUser.email   || '—'],
    ['Role',         currentUser.role    || '—'],
    ...(isStaff ? [] : [
      ['School',     currentUser.school  || '—'],
      ['Program',    currentUser.program || '—'],
    ]),
  ];

  el.innerHTML = `
    <!-- Hero banner -->
    <div class="acc-hero surface">
      <div class="acc-avatar-xl">${currentUser.avatar || '??'}</div>
      <div class="acc-hero-text">
        <div class="acc-hero-name">${currentUser.name || 'Unknown'}</div>
        <div class="acc-hero-meta">${[currentUser.role, ...(isStaff ? [] : [currentUser.school, currentUser.program])].filter(Boolean).join(' · ')}</div>
      </div>
    </div>

    <div class="acc-layout">

      <!-- ── Card 1: Profile Information ── -->
      <div class="surface surface-pad acc-card">
        <div class="acc-card-head">
          <h3>Profile Information</h3>
        </div>
        <div class="acc-info-list">
          ${infoRows.map(([label, value]) => `
            <div class="acc-info-row">
              <span class="acc-info-label">${label}</span>
              <span class="acc-info-value">${value}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- ── Card 2: Edit Profile ── -->
      <div class="surface surface-pad acc-card">
        <div class="acc-card-head">
          <h3>Edit Profile</h3>
          <p>Update your personal information</p>
        </div>
        <div class="acc-form">
          <div class="form-group">
            <label class="form-label">Full Name <span class="req">*</span></label>
            <input class="form-input" id="ep-name" type="text"
                   placeholder="Your full name" value="${currentUser.name || ''}"/>
          </div>
          ${isStaff ? '' : `
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">School</label>
              <input class="form-input" id="ep-school" type="text"
                     placeholder="e.g. BSU, UC" value="${currentUser.school || ''}"/>
            </div>
            <div class="form-group">
              <label class="form-label">Program / Course</label>
              <input class="form-input" id="ep-program" type="text"
                     placeholder="e.g. IT, CS" value="${currentUser.program || ''}"/>
            </div>
          </div>`}
          <div class="form-group">
            <label class="form-label">Email Address</label>
            <input class="form-input acc-readonly" id="ep-email" type="email"
                   value="${currentUser.email || ''}" disabled/>
            <span class="acc-hint">Email cannot be changed here</span>
          </div>
          <div class="form-group">
            <label class="form-label">Role</label>
            <input class="form-input acc-readonly" id="ep-role" type="text"
                   value="${currentUser.role || ''}" disabled/>
            <span class="acc-hint">Role is managed by administrators</span>
          </div>
        </div>
        <div class="acc-card-footer">
          <button class="btn-primary" id="ep-save-btn">Save Changes</button>
        </div>
      </div>

      <!-- ── Card 3: Change Password ── -->
      <div class="surface surface-pad acc-card">
        <div class="acc-card-head">
          <h3>Change Password</h3>
          <p>Use a strong password to keep your account secure</p>
        </div>
        <div class="acc-form">
          <div class="form-group">
            <label class="form-label">Current Password <span class="req">*</span></label>
            ${pwField('cp-current', 'Enter current password')}
          </div>
          <div class="form-group">
            <label class="form-label">New Password <span class="req">*</span></label>
            ${pwField('cp-new', 'Enter new password')}
            <ul class="pw-reqs" id="pw-reqs">
              ${PW_RULES.map(r => `<li class="pw-req pw-req-fail" id="${r.id}">${r.label}</li>`).join('')}
            </ul>
          </div>
          <div class="form-group">
            <label class="form-label">Confirm New Password <span class="req">*</span></label>
            ${pwField('cp-confirm', 'Repeat new password')}
            <span class="acc-hint" id="cp-match-msg"></span>
          </div>
        </div>
        <div class="acc-card-footer">
          <button class="btn-primary" id="cp-save-btn" disabled>Update Password</button>
        </div>
      </div>

    </div>
  `;

  // ── Event wiring ──
  document.getElementById('ep-save-btn').addEventListener('click', saveProfile);
  document.getElementById('cp-save-btn').addEventListener('click', changePassword);
  document.getElementById('cp-new').addEventListener('input', checkPasswordReqs);
  document.getElementById('cp-confirm').addEventListener('input', checkPasswordReqs);

  el.querySelectorAll('.pw-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      const hide = input.type === 'password';
      input.type = hide ? 'text' : 'password';
      btn.textContent = hide ? 'Hide' : 'Show';
    });
  });
}

// ── Edit Profile ──────────────────────────────────────────
async function saveProfile() {
  const name      = document.getElementById('ep-name').value.trim();
  // School/Program inputs are not rendered for admins and supervisors
  const schoolEl  = document.getElementById('ep-school');
  const programEl = document.getElementById('ep-program');

  if (!name) { toast('Full name is required.'); return; }

  const updates = { name };
  if (schoolEl)  updates.school  = schoolEl.value.trim();
  if (programEl) updates.program = programEl.value.trim();

  const btn = document.getElementById('ep-save-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    const { error } = await updateProfile(currentUser.id, updates);
    if (error) {
      toast('Failed to update profile: ' + (error.message || 'Unknown error'));
      return;
    }

    Object.assign(currentUser, updates);
    currentUser.avatar = name.slice(0, 2).toUpperCase();

    document.getElementById('sb-name').textContent     = name;
    document.getElementById('sb-avatar').textContent   = currentUser.avatar;
    document.getElementById('topbar-name').textContent  = name;
    document.getElementById('topbar-avatar').textContent = currentUser.avatar;

    toast('Profile updated successfully!');
    await renderAccount();
  } finally {
    const b = document.getElementById('ep-save-btn');
    if (b) { b.disabled = false; b.textContent = 'Save Changes'; }
  }
}

// ── Password validation ───────────────────────────────────
function checkPasswordReqs() {
  const pwd     = document.getElementById('cp-new').value;
  const confirm = document.getElementById('cp-confirm').value;

  const allPass = PW_RULES.every(rule => {
    const el = document.getElementById(rule.id);
    if (!el) return true;
    const pass = rule.test(pwd);
    el.classList.toggle('pw-req-pass', pass);
    el.classList.toggle('pw-req-fail', !pass);
    return pass;
  });

  const matchEl = document.getElementById('cp-match-msg');
  if (matchEl) {
    if (!confirm) {
      matchEl.textContent = '';
    } else if (pwd === confirm) {
      matchEl.textContent = '✓ Passwords match';
      matchEl.style.color = 'var(--green)';
    } else {
      matchEl.textContent = 'Passwords do not match';
      matchEl.style.color = 'var(--red)';
    }
  }

  const saveBtn = document.getElementById('cp-save-btn');
  if (saveBtn) saveBtn.disabled = !(allPass && confirm && pwd === confirm);
}

// ── Change Password ───────────────────────────────────────
async function changePassword() {
  const btn = document.getElementById('cp-save-btn');
  try {
    const current = document.getElementById('cp-current').value;
    const newPwd  = document.getElementById('cp-new').value;
    const confirm = document.getElementById('cp-confirm').value;

    if (!current) { toast('Current password is required.'); return; }
    if (!newPwd)  { toast('New password is required.'); return; }
    if (newPwd !== confirm) { toast('Passwords do not match.'); return; }

    if (btn) { btn.disabled = true; btn.textContent = 'Updating…'; }

    const { error } = await updatePassword(currentUser.email, current, newPwd);
    if (error) {
      toast(error.message || 'Failed to update password.');
      if (btn) { btn.disabled = false; btn.textContent = 'Update Password'; }
      return;
    }

    toast('Password updated successfully!');
    ['cp-current', 'cp-new', 'cp-confirm'].forEach(id => { document.getElementById(id).value = ''; });
    checkPasswordReqs();
    if (btn) btn.textContent = 'Update Password';
  } catch (err) {
    console.error('changePassword error:', err);
    toast('Something went wrong. Try again.');
    if (btn) { btn.disabled = false; btn.textContent = 'Update Password'; }
  }
}
