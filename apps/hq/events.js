import { formatCurrency } from '../../shared/utils/formatUtils.ts';
import { formatDateShort } from '../../shared/utils/dateUtils.ts';
import { escapeHtml, statusClass } from '../../shared/utils/helpers.ts';
import { validateRequired } from '../../shared/utils/validators.ts';
import { APP_SETTINGS } from '../../config/settings.js';
import {
  fetchEvents, createEvent, updateEventStatus,
  fetchRegistrations, updateRegistrationStatus,
} from '../../shared/services/eventService.js';
import { _events, _eventRegs, _currentEvent, setEvents, setEventRegs, setCurrentEvent } from './state.js';
import { toast, openModal, closeModal } from './ui.js';

export async function loadEvents() {
  setEvents(await fetchEvents());
  renderEventsList(_events);
  showEventsView('list');
}

function showEventsView(view) {
  document.getElementById('events-list-view').style.display   = view === 'list'   ? '' : 'none';
  document.getElementById('events-detail-view').style.display = view === 'detail' ? '' : 'none';
}

export function filterEvents(status, el) {
  document.querySelectorAll('.event-filter-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  const list = status === 'all' ? _events : _events.filter(e => e.status === status);
  renderEventsList(list);
}

function regCount(eventId) {
  return _eventRegs.filter(r => r.event_id == eventId).length;
}

function statusBadgeClass(status) {
  const map = { Upcoming: 'blue', Active: 'green', Completed: 'gray', Cancelled: 'red' };
  return map[status] || 'gray';
}

export function renderEventsList(list) {
  const appUrl = APP_SETTINGS.app?.url || window.location.origin;
  const upcoming  = _events.filter(e => e.status === 'Upcoming').length;
  const totalRegs = _events.reduce((s, e) => s + regCount(e.id), 0);
  const revenue   = _events.filter(e => e.status === 'Completed')
    .reduce((s, e) => s + (e.price || 0) * regCount(e.id), 0);

  document.getElementById('events-summary').innerHTML =
    `${_events.length} event${_events.length !== 1 ? 's' : ''} &nbsp;·&nbsp; ${upcoming} upcoming &nbsp;·&nbsp; ${totalRegs} total registrations`;

  document.getElementById('events-stats').innerHTML = `
    <div class="stat-card"><div class="stat-accent" style="background:var(--gold)"></div>
      <div class="stat-label">Total Events</div><div class="stat-value">${_events.length}</div></div>
    <div class="stat-card"><div class="stat-accent" style="background:var(--blue)"></div>
      <div class="stat-label">Upcoming</div><div class="stat-value">${upcoming}</div></div>
    <div class="stat-card"><div class="stat-accent" style="background:var(--green)"></div>
      <div class="stat-label">Registrations</div><div class="stat-value">${totalRegs}</div></div>
    <div class="stat-card"><div class="stat-accent" style="background:var(--ink-1)"></div>
      <div class="stat-label">Est. Revenue</div><div class="stat-value" style="font-size:18px">${formatCurrency(revenue)}</div></div>`;

  document.getElementById('events-tbody').innerHTML = list.length
    ? list.map(e => {
        const regs = regCount(e.id);
        const capPct = e.capacity ? Math.min(100, Math.round(regs / e.capacity * 100)) : 0;
        const regUrl = `${appUrl}/register.html?event=${e.id}`;
        return `<tr>
          <td>
            <div class="project-name">${escapeHtml(e.name)}</div>
            <div class="project-client">${escapeHtml(e.event_type || '')}</div>
          </td>
          <td><span class="badge badge-${statusBadgeClass(e.status)}">${escapeHtml(e.status)}</span></td>
          <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(e.brand)}</td>
          <td style="font-size:12px">${e.date ? formatDateShort(e.date) : '—'}</td>
          <td style="font-size:12px;color:var(--ink-2)">${escapeHtml(e.venue || '—')}</td>
          <td style="font-size:12px">
            <div>${regs}${e.capacity ? ' / ' + e.capacity : ''}</div>
            ${e.capacity ? `<div style="background:var(--ink-4);border-radius:3px;height:3px;margin-top:4px;width:60px"><div style="background:var(--gold);height:3px;border-radius:3px;width:${capPct}%"></div></div>` : ''}
          </td>
          <td class="project-value">${formatCurrency(e.price || 0)}</td>
          <td>
            <div class="flex-gap" style="gap:6px">
              <button class="btn btn-ghost" style="padding:4px 8px;font-size:11px" onclick="viewEventRegistrations(${e.id})">Registrations</button>
              <button class="btn btn-ghost" style="padding:4px 8px;font-size:11px" onclick="copyRegisterUrl('${regUrl}')">Copy URL</button>
            </div>
          </td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="8"><div class="empty-state">No events yet — create your first one</div></td></tr>`;
}

export async function viewEventRegistrations(id) {
  const event = _events.find(e => e.id == id) || null;
  if (!event) return;
  setCurrentEvent(event);
  const regs = await fetchRegistrations(id);
  setEventRegs(regs);
  renderEventDetail(event, regs);
  showEventsView('detail');
}

function renderEventDetail(event, regs) {
  const appUrl = APP_SETTINGS.app?.url || window.location.origin;
  const regUrl = `${appUrl}/register.html?event=${event.id}`;
  const attended = regs.filter(r => r.status === 'Attended').length;
  const noshow   = regs.filter(r => r.status === 'No-show').length;

  document.getElementById('event-detail-header').innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <div>
        <div class="page-eyebrow">events</div>
        <div class="page-title" style="margin-bottom:4px">${escapeHtml(event.name)}</div>
        <div style="font-size:12px;color:var(--ink-3)">${escapeHtml(event.brand)} · ${escapeHtml(event.event_type || '')} · ${event.date ? formatDateShort(event.date) : '—'} · ${escapeHtml(event.venue || 'TBD')}</div>
      </div>
      <span class="badge badge-${statusBadgeClass(event.status)}" style="font-size:12px;padding:4px 10px">${escapeHtml(event.status)}</span>
    </div>
    <div class="stats-grid" style="margin-top:16px">
      <div class="stat-card"><div class="stat-accent" style="background:var(--gold)"></div>
        <div class="stat-label">Registered</div><div class="stat-value">${regs.length}${event.capacity ? ' / ' + event.capacity : ''}</div></div>
      <div class="stat-card"><div class="stat-accent" style="background:var(--green)"></div>
        <div class="stat-label">Attended</div><div class="stat-value">${attended}</div></div>
      <div class="stat-card"><div class="stat-accent" style="background:var(--ink-3)"></div>
        <div class="stat-label">No-show</div><div class="stat-value">${noshow}</div></div>
      <div class="stat-card"><div class="stat-accent" style="background:var(--ink-1)"></div>
        <div class="stat-label">Revenue</div><div class="stat-value" style="font-size:18px">${formatCurrency((event.price || 0) * attended)}</div></div>
    </div>
    <div class="card" style="margin-top:16px;padding:14px 16px">
      <div class="card-title">Registration Form URL</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
        <input class="form-input" readonly value="${regUrl}" style="font-size:11px;font-family:monospace;flex:1"/>
        <button class="btn btn-ghost" onclick="copyRegisterUrl('${regUrl}')">Copy</button>
      </div>
      <div style="font-size:11px;color:var(--ink-3);margin-top:6px">Embed this in Wix via an HTML iframe, or share as a direct link.</div>
    </div>`;

  const statusOptions = (current) => ['Registered','Attended','No-show','Cancelled']
    .map(s => `<option${s === current ? ' selected' : ''}>${s}</option>`).join('');

  document.getElementById('event-regs-tbody').innerHTML = regs.length
    ? regs.map(r => `<tr>
        <td><div class="project-name">${escapeHtml(r.name)}</div></td>
        <td style="font-size:12px">${escapeHtml(r.email)}</td>
        <td style="font-size:12px;color:var(--ink-3)">${escapeHtml(r.phone || '—')}</td>
        <td style="font-size:12px;color:var(--ink-3)">${escapeHtml(r.organization || '—')}</td>
        <td>
          <select class="form-input" style="padding:3px 6px;font-size:11px;width:120px" onchange="updateRegistrationStatus(${r.id},this.value)">
            ${statusOptions(r.status)}
          </select>
        </td>
        <td style="font-size:11px;color:var(--ink-3)">${formatDateShort(r.registered_at)}</td>
      </tr>`).join('')
    : `<tr><td colspan="6"><div class="empty-state">No registrations yet</div></td></tr>`;
}

export function backToEvents() {
  setCurrentEvent(null);
  showEventsView('list');
}

export function copyRegisterUrl(url) {
  navigator.clipboard.writeText(url).then(() => toast('URL copied to clipboard', 'success'));
}

export async function handleUpdateRegistrationStatus(id, status) {
  const ok = await updateRegistrationStatus(id, status);
  if (!ok) { toast('Could not update status', 'error'); return; }
  if (_currentEvent) {
    const regs = await fetchRegistrations(_currentEvent.id);
    setEventRegs(regs);
    renderEventDetail(_currentEvent, regs);
  }
}

export function openAddEvent() {
  const brandOpts = APP_SETTINGS.company.brands.map(b => `<option>${b}</option>`).join('');
  const typeOpts  = APP_SETTINGS.events.types.map(t => `<option>${t}</option>`).join('');
  openModal('New Event', `
    <div class="form-grid">
      <div class="form-group full"><div class="form-label">Event Name</div><input class="form-input" id="fev-name" placeholder="e.g. DTI MSME Innovation Summit"/></div>
      <div class="form-group"><div class="form-label">Brand</div>
        <select class="form-input" id="fev-brand">${brandOpts}</select></div>
      <div class="form-group"><div class="form-label">Event Type</div>
        <select class="form-input" id="fev-type">${typeOpts}</select></div>
      <div class="form-group"><div class="form-label">Date</div>
        <input class="form-input" id="fev-date" type="date"/></div>
      <div class="form-group"><div class="form-label">Venue</div>
        <input class="form-input" id="fev-venue" placeholder="e.g. SM City Baguio, Events Hall"/></div>
      <div class="form-group"><div class="form-label">Capacity</div>
        <input class="form-input" id="fev-capacity" type="number" min="0" placeholder="0 = unlimited"/></div>
      <div class="form-group"><div class="form-label">Ticket Price (PHP)</div>
        <input class="form-input" id="fev-price" type="number" min="0" placeholder="0 = free"/></div>
      <div class="form-group full"><div class="form-label">Description (optional)</div>
        <textarea class="form-input" id="fev-desc" rows="3" style="resize:vertical" placeholder="Brief event description…"></textarea></div>
    </div>`, saveEvent);
}

async function saveEvent() {
  const name = document.getElementById('fev-name').value.trim();
  const err = validateRequired(name, 'Event name');
  if (err) { toast(err, 'error'); return; }
  const result = await createEvent({
    name,
    brand:      document.getElementById('fev-brand').value,
    event_type: document.getElementById('fev-type').value,
    date:       document.getElementById('fev-date').value || null,
    venue:      document.getElementById('fev-venue').value.trim(),
    capacity:   parseInt(document.getElementById('fev-capacity').value) || 0,
    price:      parseFloat(document.getElementById('fev-price').value) || 0,
    description: document.getElementById('fev-desc').value.trim(),
    status:     'Upcoming',
  });
  if (!result) return;
  toast('Event created', 'success');
  closeModal();
  loadEvents();
}
