import type { Meeting, Client } from '@shared/types';
import { escapeHtml } from '@shared/utils/helpers.ts';

export const MEETING_STAGES = ['Discovery', 'Strategy & Proposal', 'Kickoff'] as const;
export const MEETING_STATUSES = ['Not Scheduled', 'Scheduled', 'Completed', 'Cancelled', 'No Show'] as const;

export const MEETING_STATUS_CLASS: Record<string, string> = {
  'Not Scheduled': 'pending',
  'Scheduled':     'active',
  'Completed':     'completed',
  'Cancelled':     'cancelled',
  'No Show':       'lost',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDatetime(dt: string | null): string {
  if (!dt) return '—';
  const d = new Date(dt);
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function fmtDate(dt: string | null): string {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(dt: string | null): string {
  if (!dt) return '';
  return new Date(dt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function calcDuration(start: string | null, end: string | null): string {
  if (!start || !end) return '—';
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  if (mins <= 0) return '—';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function clientName(m: Meeting, clients: Client[]): string {
  if (!m.client_id) return '—';
  const c = clients.find(c => c.id === m.client_id);
  return c ? escapeHtml(c.name) : '—';
}

function meetLinkHTML(m: Meeting): string {
  if (!m.google_meet_link) return '<span style="color:var(--ink-3)">—</span>';
  return `<a href="${escapeHtml(m.google_meet_link)}" target="_blank" rel="noopener"
    style="color:var(--blue);font-size:11px">Join Meet</a>`;
}

function actionButtons(m: Meeting): string {
  const editBtn = `<button role="menuitem" onclick="openEditMeeting(${m.id})">Edit</button>`;
  const delBtn  = `<button role="menuitem" style="color:var(--red)" onclick="handleDeleteMeeting(${m.id})">Delete</button>`;

  let statusActions = '';
  if (m.status === 'Not Scheduled') {
    statusActions = `<button role="menuitem" onclick="openEditMeeting(${m.id})">Schedule</button>`;
  } else if (m.status === 'Scheduled') {
    statusActions = `
      <button role="menuitem" onclick="markMeetingCompleted(${m.id})">Mark Completed</button>
      <button role="menuitem" onclick="markMeetingNoShow(${m.id})">No Show</button>
      <button role="menuitem" onclick="cancelMeeting(${m.id})">Cancel</button>`;
  }

  return `
    <div class="action-menu">
      <button class="btn btn-ghost btn-sm" onclick="toggleActionMenu(this)">Actions ▾</button>
      <div class="action-menu-dropdown" role="menu">
        ${statusActions}
        ${editBtn}
        ${delBtn}
      </div>
    </div>`;
}

// ── Table row ─────────────────────────────────────────────────────────────────

export function meetingTableHTML(meetings: Meeting[], clients: Client[]): string {
  return meetings.map(m => {
    const cls = MEETING_STATUS_CLASS[m.status] ?? 'pending';
    const stageCls = m.stage === 'Kickoff' ? 'completed' : m.stage === 'Strategy & Proposal' ? 'sent' : 'pending';
    return `
    <tr>
      <td><span class="text-bold">${clientName(m, clients)}</span></td>
      <td><span class="badge badge-${stageCls}">${escapeHtml(m.stage)}</span></td>
      <td><span class="badge badge-${cls}">${escapeHtml(m.status)}</span></td>
      <td>${escapeHtml(m.title ?? '—')}</td>
      <td style="white-space:nowrap">${fmtDatetime(m.start_datetime)}</td>
      <td style="white-space:nowrap">${calcDuration(m.start_datetime, m.end_datetime)}</td>
      <td>${meetLinkHTML(m)}</td>
      <td>${actionButtons(m)}</td>
    </tr>`;
  }).join('');
}

// ── Form ──────────────────────────────────────────────────────────────────────

export function meetingFormHTML(m: Partial<Meeting> = {}, clients: Client[]): string {
  const clientOpts = clients.map(c =>
    `<option value="${c.id}"${m.client_id === c.id ? ' selected' : ''}>${escapeHtml(c.name)}</option>`
  ).join('');

  const stageOpts = MEETING_STAGES.map(s =>
    `<option${m.stage === s ? ' selected' : ''}>${escapeHtml(s)}</option>`
  ).join('');

  const statusOpts = MEETING_STATUSES.map(s =>
    `<option${m.status === s ? ' selected' : ''}>${escapeHtml(s)}</option>`
  ).join('');

  const toDatetimeLocal = (dt: string | null | undefined): string => {
    if (!dt) return '';
    return new Date(dt).toISOString().slice(0, 16);
  };

  return `
  <div class="form-grid">
    <div class="form-group">
      <div class="form-label">Client</div>
      <select class="form-input" id="mt-client">
        <option value="">— Select Client —</option>
        ${clientOpts}
      </select>
    </div>
    <div class="form-group">
      <div class="form-label">Stage <span class="req">*</span></div>
      <select class="form-input" id="mt-stage">
        ${stageOpts}
      </select>
    </div>
    <div class="form-group full">
      <div class="form-label">Meeting Title</div>
      <input class="form-input" id="mt-title" placeholder="e.g. Initial Discovery Call"
        value="${escapeHtml(m.title ?? '')}"/>
    </div>
    <div class="form-group">
      <div class="form-label">Status</div>
      <select class="form-input" id="mt-status">
        ${statusOpts}
      </select>
    </div>
    <div class="form-group">
      <div class="form-label">Start Date & Time</div>
      <input class="form-input" id="mt-start" type="datetime-local"
        value="${toDatetimeLocal(m.start_datetime)}"/>
    </div>
    <div class="form-group">
      <div class="form-label">End Date & Time</div>
      <input class="form-input" id="mt-end" type="datetime-local"
        value="${toDatetimeLocal(m.end_datetime)}"/>
    </div>
    <div class="form-group">
      <div class="form-label">Google Meet Link</div>
      <input class="form-input" id="mt-meet" type="url" placeholder="https://meet.google.com/…"
        value="${escapeHtml(m.google_meet_link ?? '')}"/>
    </div>
    <div class="form-group">
      <div class="form-label">Recording Link</div>
      <input class="form-input" id="mt-recording" type="url" placeholder="https://…"
        value="${escapeHtml(m.recording_link ?? '')}"/>
    </div>
    <div class="form-group full">
      <div class="form-label">Meeting Notes</div>
      <textarea class="form-input" id="mt-notes" rows="4"
        placeholder="Key discussion points, next steps…">${escapeHtml(m.meeting_notes ?? '')}</textarea>
    </div>
  </div>`;
}

// ── Overview: stat cards + upcoming list ──────────────────────────────────────

export function meetingOverviewHTML(meetings: Meeting[], now: Date): string {
  const upcoming = meetings.filter(m =>
    m.status === 'Scheduled' && m.start_datetime && new Date(m.start_datetime) > now
  ).sort((a, b) => new Date(a.start_datetime!).getTime() - new Date(b.start_datetime!).getTime());

  const completedThisMonth = meetings.filter(m => {
    if (m.status !== 'Completed' || !m.start_datetime) return false;
    const d = new Date(m.start_datetime);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const noShows = meetings.filter(m => m.status === 'No Show');
  const next7Days = now.getTime() + 7 * 24 * 60 * 60 * 1000;
  const upcomingSoon = upcoming.filter(m => new Date(m.start_datetime!).getTime() <= next7Days);

  const statsHTML = `
    <div class="finance-stat-grid" style="margin-bottom:20px">
      <div class="stat-card">
        <div class="stat-label">Upcoming</div>
        <div class="stat-value" style="font-size:28px;color:var(--blue)">${upcoming.length}</div>
        <div class="stat-change">${upcoming.length === 1 ? '1 scheduled' : `${upcoming.length} scheduled`}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Completed This Month</div>
        <div class="stat-value" style="font-size:28px;color:var(--green)">${completedThisMonth.length}</div>
        <div class="stat-change">${completedThisMonth.length === 1 ? '1 meeting' : `${completedThisMonth.length} meetings`}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">No Shows</div>
        <div class="stat-value" style="font-size:28px;color:var(--amber)">${noShows.length}</div>
        <div class="stat-change">all time</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Meetings</div>
        <div class="stat-value" style="font-size:28px">${meetings.length}</div>
        <div class="stat-change">all time</div>
      </div>
    </div>`;

  const upcomingHTML = upcomingSoon.length === 0
    ? `<div style="color:var(--ink-3);font-size:12px;padding:16px 0">No meetings in the next 7 days.</div>`
    : `<div style="display:flex;flex-direction:column;gap:8px">
        ${upcomingSoon.map(m => `
          <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--linen);border:1px solid var(--ink-5);border-radius:8px">
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600">${escapeHtml(m.title ?? m.stage + ' Meeting')}</div>
              <div style="font-size:11px;color:var(--ink-3);margin-top:2px">
                <span class="badge badge-${MEETING_STATUS_CLASS[m.stage === 'Kickoff' ? 'Completed' : m.stage === 'Strategy & Proposal' ? 'Scheduled' : 'Not Scheduled']}" style="font-size:9px">${escapeHtml(m.stage)}</span>
                &nbsp;${fmtDatetime(m.start_datetime)}
              </div>
            </div>
            ${m.google_meet_link ? `<a href="${escapeHtml(m.google_meet_link)}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">Join Meet</a>` : ''}
            <button class="btn btn-ghost btn-sm" onclick="openEditMeeting(${m.id})">Edit</button>
          </div>`).join('')}
      </div>`;

  return statsHTML + `
    <div style="margin-bottom:8px">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);margin-bottom:10px">Next 7 Days</div>
      ${upcomingHTML}
    </div>`;
}

// ── Client detail timeline ────────────────────────────────────────────────────

export function clientMeetingTimelineHTML(meetings: Meeting[]): string {
  if (!meetings.length) {
    return `<div style="color:var(--ink-3);font-size:12px;padding:8px 0">No meetings recorded.</div>`;
  }

  const byStage = MEETING_STAGES.map(stage => {
    const stageMeetings = meetings
      .filter(m => m.stage === stage)
      .sort((a, b) => {
        if (!a.start_datetime) return 1;
        if (!b.start_datetime) return -1;
        return new Date(b.start_datetime).getTime() - new Date(a.start_datetime).getTime();
      });
    return { stage, meetings: stageMeetings };
  });

  return byStage.map(({ stage, meetings: sm }) => {
    const latest = sm[0];
    const stageStatus = sm.some(m => m.status === 'Completed') ? 'Completed'
      : sm.some(m => m.status === 'Scheduled') ? 'Scheduled'
      : 'Not Scheduled';
    const cls = MEETING_STATUS_CLASS[stageStatus] ?? 'pending';

    return `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--ink-5)">
      <div style="min-width:90px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3)">${escapeHtml(stage)}</div>
        <span class="badge badge-${cls}" style="margin-top:4px;display:inline-block">${escapeHtml(stageStatus)}</span>
      </div>
      <div style="flex:1">
        ${latest ? `
          <div style="font-size:12px;font-weight:600">${escapeHtml(latest.title ?? stage + ' Meeting')}</div>
          <div style="font-size:11px;color:var(--ink-3)">${fmtDate(latest.start_datetime)} ${fmtTime(latest.start_datetime)}</div>
          ${latest.meeting_notes ? `<div style="font-size:11px;color:var(--ink-2);margin-top:4px">${escapeHtml(latest.meeting_notes.slice(0, 100))}${latest.meeting_notes.length > 100 ? '…' : ''}</div>` : ''}
        ` : `<div style="font-size:12px;color:var(--ink-3)">Not yet scheduled</div>`}
      </div>
      ${sm.length > 1 ? `<div style="font-size:10px;color:var(--ink-3)">${sm.length} meetings</div>` : ''}
    </div>`;
  }).join('');
}
