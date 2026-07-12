import { formatCurrency } from '../../shared/utils/formatUtils.ts';
import { formatDateShort, todayISO } from '../../shared/utils/dateUtils.ts';
import { createInvoice } from '../../shared/services/financeService.ts';
import { escapeHtml, statusClass } from '../../shared/utils/helpers.ts';
import { validateRequired } from '../../shared/utils/validators.ts';
import { APP_SETTINGS } from '../../config/settings.js';
import {
  fetchEvents, createEvent, updateEvent, deleteEvent,
  fetchAllRegistrations, fetchRegistrations, updateRegistrationStatus,
} from '../../shared/services/eventService.ts';
import { _events, _eventRegs, _currentEvent, setEvents, setEventRegs, setCurrentEvent } from './state.ts';
import { toast, openModal, closeModal } from './ui.ts';
import type { Event, EventRegistration } from '../../shared/types.ts';

const gEl = (id: string) => document.getElementById(id)!;
const gVal = (id: string) => (document.getElementById(id) as HTMLInputElement).value;

let _editingEventId: number | null = null;

export async function loadEvents() {
  const [events, regs] = await Promise.all([fetchEvents(), fetchAllRegistrations()]);
  setEvents(events);
  setEventRegs(regs);
  renderEventsList(_events);
  showEventsView('list');
}

function showEventsView(view: string) {
  gEl('events-list-view').style.display   = view === 'list'   ? '' : 'none';
  gEl('events-detail-view').style.display = view === 'detail' ? '' : 'none';
}

export function filterEvents(status: string, el: HTMLElement) {
  document.querySelectorAll('.event-filter-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  const list = status === 'all' ? _events : _events.filter(e => e.status === status);
  renderEventsList(list);
}

function regCount(eventId: number) {
  return _eventRegs.filter(r => r.event_id == eventId).length;
}

function statusBadgeClass(status: string) {
  const map: Record<string, string> = { Upcoming: 'blue', Active: 'green', Completed: 'gray', Cancelled: 'red' };
  return map[status] || 'gray';
}

export function renderEventsList(list: Event[]) {
  const appUrl     = APP_SETTINGS.app?.url || window.location.origin;
  const upcoming   = _events.filter(e => e.status === 'Upcoming').length;
  const totalRegs  = _events.reduce((s, e) => s + regCount(e.id), 0);
  const revenue    = _events.filter(e => e.status === 'Completed')
    .reduce((s, e) => s + (e.price || 0) * regCount(e.id), 0);

  gEl('events-summary').innerHTML =
    `${_events.length} event${_events.length !== 1 ? 's' : ''} &nbsp;·&nbsp; ${upcoming} upcoming &nbsp;·&nbsp; ${totalRegs} total registrations`;

  gEl('events-stats').innerHTML = `
    <div class="stat-card"><div class="stat-accent" style="background:var(--gold)"></div>
      <div class="stat-label">Total Events</div><div class="stat-value">${_events.length}</div></div>
    <div class="stat-card"><div class="stat-accent" style="background:var(--blue)"></div>
      <div class="stat-label">Upcoming</div><div class="stat-value">${upcoming}</div></div>
    <div class="stat-card"><div class="stat-accent" style="background:var(--green)"></div>
      <div class="stat-label">Registrations</div><div class="stat-value">${totalRegs}</div></div>
    <div class="stat-card"><div class="stat-accent" style="background:var(--ink-1)"></div>
      <div class="stat-label">Est. Revenue</div><div class="stat-value" style="font-size:18px">${formatCurrency(revenue)}</div></div>`;

  gEl('events-tbody').innerHTML = list.length
    ? list.map(e => {
        const regs   = regCount(e.id);
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
            <div class="flex-gap" style="gap:4px;flex-wrap:wrap">
              <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="viewEventRegistrations(${e.id})">Registrations</button>
              <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="copyRegisterUrl('${regUrl}')">Copy URL</button>
              <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="openEditEvent(${e.id})">Edit</button>
              <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--red)" onclick="handleDeleteEvent(${e.id})">Delete</button>
            </div>
          </td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="8"><div class="empty-state">No events yet — create your first one</div></td></tr>`;
}

export async function viewEventRegistrations(id: number) {
  const event = _events.find(e => e.id == id) || null;
  if (!event) return;
  setCurrentEvent(event);
  const regs = await fetchRegistrations(id);
  setEventRegs(regs);
  renderEventDetail(event, regs);
  showEventsView('detail');
}

function renderEventDetail(event: Event, regs: EventRegistration[]) {
  const appUrl    = APP_SETTINGS.app?.url || window.location.origin;
  const regUrl    = `${appUrl}/register.html?event=${event.id}`;
  const attended  = regs.filter(r => r.status === 'Attended').length;
  const noshow    = regs.filter(r => r.status === 'No-show').length;

  gEl('event-detail-header').innerHTML = `
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
    </div>
    <div style="margin-top:12px">
      <button class="btn btn-ghost" style="font-size:12px" onclick="openIssueEventInvoice(${event.id})">Issue Invoice for this Event</button>
    </div>`;

  const statusOptions = (current: string) => ['Registered', 'Attended', 'No-show', 'Cancelled']
    .map(s => `<option${s === current ? ' selected' : ''}>${s}</option>`).join('');

  gEl('event-regs-tbody').innerHTML = regs.length
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
  loadEvents();
}

export function copyRegisterUrl(url: string) {
  navigator.clipboard.writeText(url).then(() => toast('URL copied to clipboard', 'success'));
}

export async function handleUpdateRegistrationStatus(id: number, status: string) {
  const ok = await updateRegistrationStatus(id, status);
  if (!ok) { toast('Could not update status', 'error'); return; }
  if (_currentEvent) {
    const regs = await fetchRegistrations(_currentEvent.id);
    setEventRegs(regs);
    renderEventDetail(_currentEvent, regs);
  }
}

// ── Event add / edit ──────────────────────────────────────────────────────────

function eventFormHTML(e: Partial<Event> = {}) {
  const brandOpts = APP_SETTINGS.company.brands.map((b: string) => `<option${b === e.brand ? ' selected' : ''}>${b}</option>`).join('');
  const typeOpts  = APP_SETTINGS.events.types.map((t: string) => `<option${t === e.event_type ? ' selected' : ''}>${t}</option>`).join('');
  const statusOpts = ['Upcoming', 'Active', 'Completed', 'Cancelled']
    .map(s => `<option${s === e.status ? ' selected' : ''}>${s}</option>`).join('');
  return `<div class="form-grid">
    <div class="form-group full"><div class="form-label">Event Name</div><input class="form-input" id="fev-name" value="${escapeHtml(e.name || '')}" placeholder="e.g. DTI MSME Innovation Summit"/></div>
    <div class="form-group"><div class="form-label">Brand</div><select class="form-input" id="fev-brand">${brandOpts}</select></div>
    <div class="form-group"><div class="form-label">Event Type</div><select class="form-input" id="fev-type">${typeOpts}</select></div>
    <div class="form-group"><div class="form-label">Status</div><select class="form-input" id="fev-status">${statusOpts}</select></div>
    <div class="form-group"><div class="form-label">Date</div><input class="form-input" id="fev-date" type="date" value="${e.date || ''}"/></div>
    <div class="form-group"><div class="form-label">Venue</div><input class="form-input" id="fev-venue" value="${escapeHtml(e.venue || '')}" placeholder="e.g. SM City Baguio, Events Hall"/></div>
    <div class="form-group"><div class="form-label">Capacity</div><input class="form-input" id="fev-capacity" type="number" min="0" value="${e.capacity || 0}" placeholder="0 = unlimited"/></div>
    <div class="form-group"><div class="form-label">Ticket Price (PHP)</div><input class="form-input" id="fev-price" type="number" min="0" value="${e.price || 0}" placeholder="0 = free"/></div>
    <div class="form-group full"><div class="form-label">Description (optional)</div><textarea class="form-input" id="fev-desc" rows="3" style="resize:vertical" placeholder="Brief event description…">${escapeHtml(e.description || '')}</textarea></div>
  </div>`;
}

export function openAddEvent() {
  _editingEventId = null;
  openModal('New Event', eventFormHTML({ status: 'Upcoming' }), saveEvent);
}

export function openEditEvent(id: number) {
  const e = _events.find(x => x.id === id);
  if (!e) return;
  _editingEventId = id;
  openModal('Edit Event', eventFormHTML(e), saveEvent);
}

async function saveEvent() {
  const name = gVal('fev-name').trim();
  const err  = validateRequired(name, 'Event name');
  if (err) { toast(err, 'error'); return; }
  const payload = {
    name,
    brand:       gVal('fev-brand'),
    event_type:  gVal('fev-type'),
    status:      gVal('fev-status'),
    date:        gVal('fev-date') || null,
    venue:       gVal('fev-venue').trim(),
    capacity:    parseInt(gVal('fev-capacity')) || 0,
    price:       parseFloat(gVal('fev-price')) || 0,
    description: gVal('fev-desc').trim(),
  };
  if (_editingEventId) {
    const ok = await updateEvent(_editingEventId, payload);
    if (!ok) { toast('Could not update event', 'error'); return; }
    toast('Event updated', 'success');
  } else {
    const result = await createEvent({ ...payload, status: payload.status || 'Upcoming' });
    if (!result) { toast('Could not create event. Please try again.', 'error'); return; }
    toast('Event created', 'success');
  }
  closeModal();
  loadEvents();
}

export async function handleDeleteEvent(id: number) {
  if (!confirm('Delete this event? All registrations will also be removed.')) return;
  const ok = await deleteEvent(id);
  if (!ok) { toast('Could not delete event', 'error'); return; }
  toast('Event deleted', '');
  loadEvents();
}

// ── Issue invoice from event ──────────────────────────────────────────────────

let _invoiceEventId: number | null = null;

export function openIssueEventInvoice(eventId: number) {
  const event = _events.find(e => e.id === eventId);
  if (!event) return;
  _invoiceEventId = eventId;
  const eventRegsForThis = _eventRegs.filter(r => r.event_id === eventId);
  const attended = eventRegsForThis.filter(r => r.status === 'Attended').length;
  const totalRegs = eventRegsForThis.length;
  const suggested = (event.price || 0) * (attended || totalRegs || 1);
  openModal('Issue Invoice', `<div class="form-grid">
    <div class="form-group"><div class="form-label">OR Number</div><input class="form-input" id="eiv-or" placeholder="OR-2026-001"/></div>
    <div class="form-group"><div class="form-label">Client / Payee</div><input class="form-input" id="eiv-client" value="${escapeHtml(event.name)}" placeholder="Client name"/></div>
    <div class="form-group"><div class="form-label">Amount (₱)</div><input class="form-input" id="eiv-amount" type="number" value="${suggested}" min="0"/></div>
    <div class="form-group"><div class="form-label">Status</div>
      <select class="form-input" id="eiv-status">
        <option>Unpaid</option><option>Paid</option>
      </select>
    </div>
    <div class="form-group"><div class="form-label">Date Issued</div><input class="form-input" id="eiv-date" type="date" value="${todayISO()}"/></div>
    <div class="form-group"><div class="form-label">Due Date</div><input class="form-input" id="eiv-due" type="date"/></div>
    <div class="form-group full" style="font-size:11px;color:var(--ink-3)">
      ${totalRegs} registered · ${attended} attended · ₱${(event.price || 0).toLocaleString()} per ticket
    </div>
  </div>`, saveIssueEventInvoice);
}

async function saveIssueEventInvoice() {
  const or_num = gVal('eiv-or').trim();
  if (!or_num) { toast('OR number is required', 'error'); return; }
  const result = await createInvoice({
    or_num,
    client:   gVal('eiv-client').trim(),
    amount:   +gVal('eiv-amount') || 0,
    status:   gVal('eiv-status'),
    date:     gVal('eiv-date') || null,
    due:      gVal('eiv-due') || null,
    event_id: _invoiceEventId || null,
  });
  if (!result) { toast('Could not create invoice. Please try again.', 'error'); return; }
  toast('Invoice created — check Finance › AR', 'success');
  closeModal();
  _invoiceEventId = null;
}
