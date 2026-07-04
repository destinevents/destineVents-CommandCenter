function topSkillsFor(sheets, n) {
  const map = {};
  sheets.forEach((ts) =>
    (ts.skills || []).forEach((s) => {
      map[s] = (map[s] || 0) + 1;
    })
  );
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([s]) => s);
}

async function renderApprovals() {
  const pending = pendingApprovals();
  document.getElementById('appr-sub').textContent =
    `${pending.length} entr${pending.length === 1 ? 'y' : 'ies'} awaiting review`;
  if (!pending.length) {
    document.getElementById('appr-list').innerHTML =
      `<div class="empty-state surface"><div class="empty-icon">🎉</div>All caught up — no pending approvals!</div>`;
    return;
  }
  const taskById = new Map(liveTasks.map((t) => [t.id, t]));
  const userById = new Map(liveUsers.map((u) => [u.id, u]));
  document.getElementById('appr-list').innerHTML = pending
    .map((ts) => {
      const task = taskById.get(ts.task_id);
      const intern = userById.get(ts.intern_id);
      return `<div class="appr-card" style="margin-bottom:12px">
      <div class="appr-layout">
        <div style="display:flex;gap:14px;align-items:flex-start">
          ${avatarEl(intern?.avatar || '?', 42)}
          <div>
            <div style="font-weight:700;font-size:14px;color:#1a1a1a">${escapeHtml(intern?.name) || '—'}</div>
            <div style="font-size:11px;color:var(--faint)">${intern?.school || ''} · ${ts.date}</div>
            <div style="font-size:13px;color:#374151;margin-top:6px;max-width:380px">${escapeHtml(ts.activity_description)}</div>
            ${task ? `<div class="task-link-tag">📋 ${escapeHtml(task.title)}</div>` : ''}
            <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px">${(ts.skills || []).map(skillPillGreen).join('')}</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0">
          <div style="font-size:22px;font-weight:800;color:#252f27">${ts.hours}h</div>
          <span style="font-size:11px;color:var(--muted);background:#f3f4f6;border-radius:6px;padding:2px 8px">${ts.industry_category}</span>
          <div style="display:flex;gap:7px;margin-top:4px">
            <button class="btn-primary" style="padding:8px 16px;font-size:12px" data-action="approve-sheet" data-id="${ts.id}">✓ Approve</button>
            <button class="btn-sm-reject" style="padding:8px 14px;border:1.5px solid #fecaca" data-action="reject-sheet" data-id="${ts.id}">✕ Reject</button>
          </div>
        </div>
      </div>
    </div>`;
    })
    .join('');
}

async function renderInterns() {
  const interns = liveUsers.filter((u) => u.role === 'intern');
  document.getElementById('interns-grid').innerHTML = interns
    .map((intern) => {
      const iSheets = liveTimesheets.filter((t) => t.intern_id === intern.id);
      const approved = iSheets
        .filter((t) => t.status === 'approved')
        .reduce((s, t) => s + t.hours, 0);
      const pending = iSheets.filter((t) => t.status === 'pending').length;
      const done = liveTasks.filter(
        (t) => t.assigned_to === intern.id && ['completed', 'reviewed'].includes(t.status)
      ).length;
      const topSkills = topSkillsFor(
        iSheets.filter((t) => t.status === 'approved'),
        3
      );
      return `<div class="intern-card">
      <div class="intern-card-head">
        ${avatarEl(intern.avatar, 46, '#C9A84C')}
        <div>
          <div class="intern-card-name">${escapeHtml(intern.name)}</div>
          <div class="intern-card-sub">${intern.program} · ${intern.school}</div>
        </div>
      </div>
      <div class="intern-stats">
        <div class="intern-stat"><div class="sv">${approved}h</div><div class="sl">Approved hrs</div></div>
        <div class="intern-stat"><div class="sv">${done}</div><div class="sl">Tasks done</div></div>
        <div class="intern-stat"><div class="sv">${pending}</div><div class="sl">Pending</div></div>
      </div>
      <div class="intern-skills">
        ${topSkills.length ? `<div class="section-label">TOP SKILLS</div><div class="flex-wrap">${topSkills.map(skillPill).join('')}</div>` : '<div style="font-size:12px;color:var(--faint)">No approved entries yet.</div>'}
      </div>
    </div>`;
    })
    .join('');
}

async function renderReports() {
  const interns = liveUsers.filter((u) => u.role === 'intern');
  const totalApprH = liveTimesheets
    .filter((t) => t.status === 'approved')
    .reduce((s, t) => s + t.hours, 0);
  const pending = pendingApprovals().length;

  document.getElementById('report-overview').innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <span style="font-size:22px">📊</span>
      <h3 style="margin:0;font-size:15px;font-weight:700;color:#252f27">System Overview</h3>
    </div>
    <div class="grid4">
      ${[
        ['Total Interns', interns.length],
        ['Total Tasks', liveTasks.length],
        ['Approved Hours', totalApprH + 'h'],
        ['Pending Approvals', pending],
      ]
        .map(
          ([k, v]) => `
        <div style="background:#f9fafb;border-radius:8px;padding:12px 14px">
          <div style="font-size:22px;font-weight:800;color:#252f27">${v}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">${k}</div>
        </div>`
        )
        .join('')}
    </div>`;

  document.getElementById('reports-tbody').innerHTML = interns
    .map((intern) => {
      const iSheets = liveTimesheets.filter(
        (t) => t.intern_id === intern.id && t.status === 'approved'
      );
      const iHours = iSheets.reduce((s, t) => s + t.hours, 0);
      const iDone = liveTasks.filter(
        (t) => t.assigned_to === intern.id && ['completed', 'reviewed'].includes(t.status)
      ).length;
      const skillSet = new Set();
      iSheets.forEach((ts) => (ts.skills || []).forEach((s) => skillSet.add(s)));
      const skillArr = [...skillSet];
      return `<tr>
      <td><div class="flex-gap-8">${avatarEl(intern.avatar, 28)}<span class="text-bold">${escapeHtml(intern.name)}</span></div></td>
      <td style="color:#374151">${intern.school}</td>
      <td style="color:#374151">${intern.program}</td>
      <td style="font-weight:800;color:#252f27">${iHours}h</td>
      <td style="color:#374151">${iDone} completed</td>
      <td><div style="display:flex;gap:4px;flex-wrap:wrap">${skillArr.slice(0, 2).map(skillPill).join('')}${skillArr.length > 2 ? `<span style="font-size:10px;color:var(--faint)">+${skillArr.length - 2}</span>` : ''}</div></td>
      <td><div style="display:flex;gap:5px">
        <button style="background:#ecfdf5;color:#16a34a;border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer" data-action="export-excel" data-id="${intern.id}">📊 Excel</button>
        <button style="background:#eff6ff;color:#2563eb;border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer" data-action="export-pdf" data-id="${intern.id}">📄 PDF</button>
      </div></td>
    </tr>`;
    })
    .join('');
}

function exportExcel(uid) {
  const intern = liveUsers.find((u) => u.id === uid);
  if (!intern) {
    toast('Intern not found — please refresh.');
    return;
  }
  const sheets = liveTimesheets.filter((t) => t.intern_id === uid && t.status === 'approved');
  let csv = 'Date,Task,Activity,Hours,Category,Skills,Status\n';
  sheets.forEach((ts) => {
    const task = liveTasks.find((t) => t.id === ts.task_id);
    csv += `"${ts.date}","${escapeHtml(task?.title) || '—'}","${escapeHtml(ts.activity_description)}",${ts.hours},"${ts.industry_category}","${(ts.skills || []).join('; ')}","${ts.status}"\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${intern.name.replace(/ /g, '_')}_Timesheet.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Excel export downloaded!');
}

function exportPDF(uid) {
  const intern = liveUsers.find((u) => u.id === uid);
  if (!intern) {
    toast('Intern not found — please refresh.');
    return;
  }
  const supervisor = liveUsers.find((u) => u.role === 'supervisor') || { name: 'Supervisor' };
  const sheets = liveTimesheets.filter((t) => t.intern_id === uid && t.status === 'approved');
  const totalH = sheets.reduce((s, t) => s + t.hours, 0);
  const topSkills = topSkillsFor(sheets, 5);
  const rows = sheets
    .map((ts) => {
      const task = liveTasks.find((t) => t.id === ts.task_id);
      return `<tr><td>${escapeHtml(ts.date)}</td><td>${escapeHtml(task?.title) || '—'}</td><td>${escapeHtml(ts.activity_description)}</td><td>${ts.hours}h</td><td>${escapeHtml(ts.industry_category)}</td></tr>`;
    })
    .join('');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body{font-family:'DM Sans',sans-serif;padding:40px;color:#1a1a1a;max-width:800px;margin:0 auto}
    h1{color:#252f27;font-size:22px;margin-bottom:4px} .sub{color:#6b7280;font-size:13px}
    .divider{border:none;border-top:2px solid #C9A84C;margin:20px 0}
    .meta-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px}
    .meta-box{background:#f9fafb;border-radius:8px;padding:12px;text-align:center}
    .meta-box .v{font-size:20px;font-weight:800;color:#252f27}.meta-box .l{font-size:11px;color:#6b7280;margin-top:2px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{background:#252f27;color:#F5ECD7;padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase}
    td{padding:9px 12px;border-bottom:1px solid #f3f4f6} tr:nth-child(even) td{background:#fafafa}
    .sig-section{margin-top:40px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px}
    .sig-box{border-top:2px solid #e5e7eb;padding-top:8px;font-size:11px;color:#6b7280}
    .skills-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
    .sp{background:#eef2ff;color:#6366f1;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:600}
  </style></head><body>
    <h1>Internship Timesheet Report</h1>
    <div class="sub">Disenyo Digitals Collective OPC · Baguio City, Philippines</div>
    <hr class="divider"/>
    <div class="meta-grid">
      <div class="meta-box"><div class="v">${escapeHtml(intern.name)}</div><div class="l">Intern Name</div></div>
      <div class="meta-box"><div class="v">${escapeHtml(intern.program)}</div><div class="l">Program</div></div>
      <div class="meta-box"><div class="v">${escapeHtml(intern.school)}</div><div class="l">School</div></div>
    </div>
    <div class="meta-grid">
      <div class="meta-box"><div class="v">${totalH}h</div><div class="l">Total Approved Hours</div></div>
      <div class="meta-box"><div class="v">${sheets.length}</div><div class="l">Approved Entries</div></div>
      <div class="meta-box"><div class="v">${new Date().toLocaleDateString('en-PH')}</div><div class="l">Report Date</div></div>
    </div>
    <h3 style="margin:0 0 8px;font-size:14px;color:#252f27">Top Skills Demonstrated</h3>
    <div class="skills-row">${topSkills.map((s) => `<span class="sp">${s}</span>`).join('')}</div>
    <hr class="divider"/>
    <table><thead><tr><th>Date</th><th>Task</th><th>Activity</th><th>Hours</th><th>Category</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="sig-section">
      <div class="sig-box"><strong>Intern Signature</strong><br/>${escapeHtml(intern.name)}<br/><br/><br/>___________________</div>
      <div class="sig-box"><strong>Supervisor Signature</strong><br/>${escapeHtml(supervisor.name)}<br/><br/><br/>___________________</div>
      <div class="sig-box"><strong>Company Seal</strong><br/>Disenyo Digitals<br/>Collective OPC<br/><br/>___________________</div>
    </div>
  </body></html>`;
  const w = window.open('', '_blank');
  if (!w) {
    toast('Pop-up blocked — please allow pop-ups for this site.');
    return;
  }
  w.document.write(html);
  w.document.close();
  w.print();
  toast('PDF report opened for printing!');
}

// ── Audit Log ─────────────────────────────────────────────
// Cache the page between visits — the log rarely changes minute to minute
let auditLogCache = { logs: null, at: 0 };
const AUDIT_CACHE_MS = 60000;

async function renderAuditLog() {
  if (!auditLogCache.logs || Date.now() - auditLogCache.at > AUDIT_CACHE_MS) {
    auditLogCache = { logs: await fetchAuditLogs(), at: Date.now() };
  }
  const logs = auditLogCache.logs;
  const userById = new Map(liveUsers.map(u => [u.id, u]));
  document.getElementById('audit-tbody').innerHTML = logs.map(l => {
    const who = userById.get(l.performed_by) || {};
    const details = l.metadata && Object.keys(l.metadata).length
      ? Object.entries(l.metadata)
          .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
          .join(' · ')
      : '—';
    return `<tr>
      <td style="white-space:nowrap;color:#374151">${formatDateShort(l.created_at?.slice(0, 10))} · ${formatTime(l.created_at)}</td>
      <td><div class="flex-gap-8">${avatarEl(who.avatar || '?', 24)}<span class="text-bold">${escapeHtml(who.name) || '—'}</span></div></td>
      <td class="text-ink">${escapeHtml((l.action || '').replace(/_/g, ' '))}</td>
      <td class="text-muted">${escapeHtml(l.target_type) || '—'}</td>
      <td class="truncate text-muted">${escapeHtml(details)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" class="no-data-center">No activity logged yet.</td></tr>';
}
