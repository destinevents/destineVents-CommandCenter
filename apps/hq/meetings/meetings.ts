import type { Meeting } from '@shared/types';
import { _meetings, setMeetings, _clients, setClients } from '@hq/core/state.ts';
import { toast, openModal, closeModal } from '@hq/core/ui.ts';
import { validateRequired } from '@shared/utils/validators.ts';
import { escapeHtml } from '@shared/utils/helpers.ts';
import { fetchClients } from '@hq/clients/clientService.ts';
import {
  fetchMeetings, fetchMeetingsByClient,
  createMeeting, updateMeeting, deleteMeeting,
} from './meetingService.ts';
import {
  MEETING_STAGES, MEETING_STATUSES, MEETING_STATUS_CLASS,
  meetingTableHTML, meetingFormHTML, meetingOverviewHTML,
  clientMeetingTimelineHTML,
} from './templates/meetings.ts';

export { fetchMeetingsByClient, clientMeetingTimelineHTML };

// ── Module state ──────────────────────────────────────────────────────────────

let _editingMeetingId: number | null = null;
let _meetingSearch = '';
let _meetingFilterStage = '';
let _meetingFilterStatus = '';
let _meetingFilterDateFrom = '';
let _meetingFilterDateTo = '';
let _activeMeetingTab = 'overview';

const gVal = (id: string) =>
  (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null)?.value ?? '';

// ── Load ──────────────────────────────────────────────────────────────────────

export async function loadMeetings(): Promise<void> {
  try {
    const [meetings, clients] = await Promise.all([
      fetchMeetings(),
      _clients.length ? Promise.resolve(_clients) : fetchClients(),
    ]);
    setMeetings(meetings || []);
    if (!_clients.length && clients) setClients(clients);
    _renderActiveMeetingTab();
  } catch (error) {
    console.error('loadMeetings failed:', error);
    toast('Could not load meetings', 'error');
  }
}

// ── Tab switching ─────────────────────────────────────────────────────────────

export function showMeetingTab(name: string, el: HTMLElement): void {
  _activeMeetingTab = name;
  document.querySelectorAll('.mtab').forEach(t => t.classList.remove('active'));
  const tab = document.getElementById('mtab-' + name);
  if (tab) tab.classList.add('active');
  document.querySelectorAll('#meetings-subtabs .sub-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  _renderActiveMeetingTab();
}

function _renderActiveMeetingTab(): void {
  if (_activeMeetingTab === 'list') {
    _renderMeetingList();
  } else {
    _renderMeetingOverview();
  }
}

// ── Overview ──────────────────────────────────────────────────────────────────

function _renderMeetingOverview(): void {
  const container = document.getElementById('mtab-overview');
  if (!container) return;
  container.innerHTML = meetingOverviewHTML(_meetings, new Date());
}

// ── List (All Meetings) ───────────────────────────────────────────────────────

function _renderMeetingList(): void {
  const container = document.getElementById('mtab-list');
  if (!container) return;

  let filtered = [..._meetings];

  if (_meetingSearch) {
    const q = _meetingSearch.toLowerCase();
    filtered = filtered.filter(m => {
      const title = (m.title ?? '').toLowerCase();
      const client = _clients.find(c => c.id === m.client_id);
      const clientStr = client ? client.name.toLowerCase() : '';
      return title.includes(q) || clientStr.includes(q);
    });
  }
  if (_meetingFilterStage) filtered = filtered.filter(m => m.stage === _meetingFilterStage);
  if (_meetingFilterStatus) filtered = filtered.filter(m => m.status === _meetingFilterStatus);
  if (_meetingFilterDateFrom) filtered = filtered.filter(m =>
    m.start_datetime && m.start_datetime >= _meetingFilterDateFrom
  );
  if (_meetingFilterDateTo) filtered = filtered.filter(m =>
    m.start_datetime && m.start_datetime.slice(0, 10) <= _meetingFilterDateTo
  );

  const hasFilters = !!(
    _meetingSearch || _meetingFilterStage || _meetingFilterStatus ||
    _meetingFilterDateFrom || _meetingFilterDateTo
  );

  const stageOpts = MEETING_STAGES.map(s =>
    `<option value="${escapeHtml(s)}"${_meetingFilterStage === s ? ' selected' : ''}>${escapeHtml(s)}</option>`
  ).join('');
  const statusOpts = MEETING_STATUSES.map(s =>
    `<option value="${escapeHtml(s)}"${_meetingFilterStatus === s ? ' selected' : ''}>${escapeHtml(s)}</option>`
  ).join('');

  const rows = filtered.length
    ? meetingTableHTML(filtered, _clients)
    : `<tr><td colspan="8"><div class="empty-state" style="padding:32px;text-align:center;color:var(--ink-3)">No meetings found.</div></td></tr>`;

  container.innerHTML = `
    <div class="page-actions" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;gap:8px;flex:1;flex-wrap:wrap;align-items:center">
        <input class="form-input" id="mt-search" placeholder="Search client or title…"
          value="${escapeHtml(_meetingSearch)}" oninput="setMeetingFilter()" style="width:220px"/>
        <select class="form-input" id="mt-filter-stage" onchange="setMeetingFilter()" style="width:180px">
          <option value="">All Stages</option>
          ${stageOpts}
        </select>
        <select class="form-input" id="mt-filter-status" onchange="setMeetingFilter()" style="width:160px">
          <option value="">All Statuses</option>
          ${statusOpts}
        </select>
        <input class="form-input" id="mt-date-from" type="date" value="${_meetingFilterDateFrom}"
          onchange="setMeetingFilter()" style="width:145px" title="From date"/>
        <input class="form-input" id="mt-date-to" type="date" value="${_meetingFilterDateTo}"
          onchange="setMeetingFilter()" style="width:145px" title="To date"/>
        ${hasFilters ? `<button class="btn btn-ghost" onclick="clearMeetingFilters()">Clear</button>` : ''}
      </div>
      <button class="btn btn-primary" onclick="openAddMeeting()">+ New Meeting</button>
    </div>
    <div style="overflow-x:auto">
      <table class="ledger-table">
        <thead>
          <tr>
            <th>Client</th>
            <th>Stage</th>
            <th>Status</th>
            <th>Title</th>
            <th>Date & Time</th>
            <th>Duration</th>
            <th>Meet Link</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ── Filters ───────────────────────────────────────────────────────────────────

export function setMeetingFilter(): void {
  _meetingSearch = (document.getElementById('mt-search') as HTMLInputElement | null)?.value.toLowerCase() ?? '';
  _meetingFilterStage = (document.getElementById('mt-filter-stage') as HTMLSelectElement | null)?.value ?? '';
  _meetingFilterStatus = (document.getElementById('mt-filter-status') as HTMLSelectElement | null)?.value ?? '';
  _meetingFilterDateFrom = (document.getElementById('mt-date-from') as HTMLInputElement | null)?.value ?? '';
  _meetingFilterDateTo = (document.getElementById('mt-date-to') as HTMLInputElement | null)?.value ?? '';
  _renderMeetingList();
}

export function clearMeetingFilters(): void {
  _meetingSearch = '';
  _meetingFilterStage = '';
  _meetingFilterStatus = '';
  _meetingFilterDateFrom = '';
  _meetingFilterDateTo = '';
  _renderMeetingList();
}

// ── Form open/save ────────────────────────────────────────────────────────────

export function openAddMeeting(): void {
  _editingMeetingId = null;
  openModal('New Meeting', meetingFormHTML({}, _clients), saveMeeting);
}

export function openEditMeeting(id: number): void {
  const m = _meetings.find(x => x.id === id);
  if (!m) return;
  _editingMeetingId = id;
  openModal('Edit Meeting', meetingFormHTML(m, _clients), saveMeeting);
}

function _readMeetingForm(): Partial<Meeting> | null {
  const stageRaw = gVal('mt-stage');
  const stageErr = validateRequired(stageRaw, 'Stage');
  if (stageErr) { toast(stageErr, 'error'); return null; }
  const stage = (MEETING_STAGES as readonly string[]).includes(stageRaw)
    ? stageRaw
    : 'Discovery';

  const statusRaw = gVal('mt-status');
  const status = (MEETING_STATUSES as readonly string[]).includes(statusRaw)
    ? statusRaw
    : 'Not Scheduled';

  const clientIdRaw = gVal('mt-client');
  const client_id = clientIdRaw ? Number(clientIdRaw) : null;

  const title = gVal('mt-title').trim() || null;
  const startRaw = gVal('mt-start');
  const endRaw = gVal('mt-end');
  const start_datetime = startRaw ? new Date(startRaw).toISOString() : null;
  const end_datetime = endRaw ? new Date(endRaw).toISOString() : null;

  if (start_datetime && end_datetime && end_datetime <= start_datetime) {
    toast('End time must be after start time', 'error');
    return null;
  }

  const google_meet_link = gVal('mt-meet').trim() || null;
  const recording_link = gVal('mt-recording').trim() || null;
  const meeting_notes = gVal('mt-notes').trim() || null;

  return {
    client_id,
    stage,
    status,
    title,
    start_datetime,
    end_datetime,
    google_meet_link,
    recording_link,
    meeting_notes,
  };
}

export async function saveMeeting(): Promise<void> {
  const payload = _readMeetingForm();
  if (!payload) return;

  try {
    if (_editingMeetingId !== null) {
      const ok = await updateMeeting(_editingMeetingId, payload);
      if (!ok) { toast('Could not update meeting', 'error'); return; }
      toast('Meeting updated', 'success');
    } else {
      const result = await createMeeting(payload);
      if (!result) { toast('Could not save meeting', 'error'); return; }
      toast('Meeting saved', 'success');
    }
    closeModal();
    await loadMeetings();
  } catch (error) {
    console.error('saveMeeting failed:', error);
    toast('An unexpected error occurred', 'error');
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function handleDeleteMeeting(id: number): Promise<void> {
  if (!confirm('Delete this meeting? This cannot be undone.')) return;
  try {
    const ok = await deleteMeeting(id);
    if (!ok) { toast('Could not delete meeting', 'error'); return; }
    toast('Meeting deleted', 'success');
    await loadMeetings();
  } catch (error) {
    console.error('handleDeleteMeeting failed:', error);
    toast('An unexpected error occurred', 'error');
  }
}

// ── Quick status updates ──────────────────────────────────────────────────────

export async function markMeetingCompleted(id: number): Promise<void> {
  await _updateStatus(id, 'Completed', 'Meeting marked as completed');
}

export async function markMeetingNoShow(id: number): Promise<void> {
  await _updateStatus(id, 'No Show', 'Meeting marked as no show');
}

export async function cancelMeeting(id: number): Promise<void> {
  await _updateStatus(id, 'Cancelled', 'Meeting cancelled');
}

async function _updateStatus(id: number, status: string, successMsg: string): Promise<void> {
  try {
    const ok = await updateMeeting(id, { status });
    if (!ok) { toast('Could not update status', 'error'); return; }
    toast(successMsg, 'success');
    await loadMeetings();
  } catch (error) {
    console.error('_updateStatus failed:', error);
    toast('An unexpected error occurred', 'error');
  }
}
