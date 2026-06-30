const PW_RULES = [
  { id: 'req-len',     test: p => p.length >= 8,             label: 'Minimum 8 characters' },
  { id: 'req-upper',   test: p => /[A-Z]/.test(p),           label: 'At least one uppercase letter' },
  { id: 'req-lower',   test: p => /[a-z]/.test(p),           label: 'At least one lowercase letter' },
  { id: 'req-num',     test: p => /[0-9]/.test(p),           label: 'At least one number' },
  { id: 'req-special', test: p => /[^A-Za-z0-9]/.test(p),   label: 'At least one special character' },
];

async function renderAccount() {
  const el = document.getElementById('page-account');
  const authUser = await getAuthUser();
  const joinedDate = authUser?.created_at
    ? new Date(authUser.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';

  const infoRows = [
    ['Full Name',    currentUser.name    || '—'],
    ['Email',        currentUser.email   || '—'],
    ['Role',         currentUser.role    || '—'],
    ['School',       currentUser.school  || '—'],
    ['Program',      currentUser.program || '—'],
    ['Member Since', joinedDate],
  ];

  el.innerHTML = `
    <!-- Hero banner -->
    <div class="acc-hero surface">
      <div class="acc-avatar-xl">${currentUser.avatar || '??'}</div>
      <div class="acc-hero-text">
        <div class="acc-hero-name">${currentUser.name || 'Unknown'}</div>
        <div class="acc-hero-meta">${[currentUser.role, currentUser.school, currentUser.program].filter(Boolean).join(' · ')}</div>
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
          </div>
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
            <div class="pw-wrap">
              <input class="form-input" id="cp-current" type="password" placeholder="Enter current password"/>
              <button type="button" class="pw-toggle-btn" data-target="cp-current">Show</button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">New Password <span class="req">*</span></label>
            <div class="pw-wrap">
              <input class="form-input" id="cp-new" type="password" placeholder="Enter new password"/>
              <button type="button" class="pw-toggle-btn" data-target="cp-new">Show</button>
            </div>
            <ul class="pw-reqs" id="pw-reqs">
              ${PW_RULES.map(r => `<li class="pw-req pw-req-fail" id="${r.id}">${r.label}</li>`).join('')}
            </ul>
          </div>
          <div class="form-group">
            <label class="form-label">Confirm New Password <span class="req">*</span></label>
            <div class="pw-wrap">
              <input class="form-input" id="cp-confirm" type="password" placeholder="Repeat new password"/>
              <button type="button" class="pw-toggle-btn" data-target="cp-confirm">Show</button>
            </div>
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
  const name    = document.getElementById('ep-name').value.trim();
  const school  = document.getElementById('ep-school').value.trim();
  const program = document.getElementById('ep-program').value.trim();

  if (!name) { toast('Full name is required.'); return; }

  const btn = document.getElementById('ep-save-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    const { error } = await updateProfile(currentUser.id, { name, school, program });
    if (error) {
      toast('Failed to update profile: ' + (error.message || 'Unknown error'));
      return;
    }

    currentUser.name    = name;
    currentUser.school  = school;
    currentUser.program = program;
    currentUser.avatar  = name.slice(0, 2).toUpperCase();

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

  let allPass = true;
  PW_RULES.forEach(rule => {
    const el = document.getElementById(rule.id);
    if (!el) return;
    const pass = rule.test(pwd);
    if (!pass) allPass = false;
    el.classList.toggle('pw-req-pass', pass);
    el.classList.toggle('pw-req-fail', !pass);
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

    const { error } = await updatePassword(current, newPwd);
    if (error) {
      toast(error.message || 'Failed to update password.');
      if (btn) { btn.disabled = false; btn.textContent = 'Update Password'; }
      return;
    }

    toast('Password updated successfully!');
    const curEl = document.getElementById('cp-current');
    const newEl = document.getElementById('cp-new');
    const conEl = document.getElementById('cp-confirm');
    if (curEl) curEl.value = '';
    if (newEl) newEl.value = '';
    if (conEl) conEl.value = '';
    checkPasswordReqs();
    if (btn) btn.textContent = 'Update Password';
  } catch (err) {
    console.error('changePassword error:', err);
    toast('Something went wrong. Try again.');
    if (btn) { btn.disabled = false; btn.textContent = 'Update Password'; }
  }
}
