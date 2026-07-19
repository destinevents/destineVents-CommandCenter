import { todayISO } from '@shared/utils/dateUtils.ts';
import { createInvoice } from '@hq/finance/financeService.ts';
import { validateRequired } from '@shared/utils/validators.ts';
import { APP_SETTINGS } from '@config/settings.ts';
import {
  fetchEvents, createEvent, updateEvent, deleteEvent,
  fetchAllRegistrations, fetchRegistrations, updateRegistrationStatus,
} from '@hq/events/eventService.ts';
import { _events, _eventRegs, _currentEvent, setEvents, setEventRegs, setCurrentEvent } from '@hq/core/state.ts';
import { toast, openModal, closeModal } from '@hq/core/ui.ts';
import type { Event, EventRegistration } from '@shared/types.ts';
import {
  eventsStatsHTML, eventTableHTML,
  eventDetailHeaderHTML, registrationTableHTML,
  eventFormHTML, eventInvoiceFormHTML,
} from './events.templates.ts';

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

export function renderEventsList(list: Event[]) {
  const appUrl    = APP_SETTINGS.app?.url || window.location.origin;
  const upcoming  = _events.filter(e => e.status === 'Upcoming').length;
  const totalRegs = _eventRegs.length;

  gEl('events-summary').innerHTML =
    `${_events.length} event${_events.length !== 1 ? 's' : ''} &nbsp;·&nbsp; ${upcoming} upcoming &nbsp;·&nbsp; ${totalRegs} total registrations`;

  gEl('events-stats').innerHTML = eventsStatsHTML(_events, _eventRegs);
  gEl('events-tbody').innerHTML = eventTableHTML(list, _eventRegs, appUrl);
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
  const appUrl = APP_SETTINGS.app?.url || window.location.origin;
  gEl('event-detail-header').innerHTML = eventDetailHeaderHTML(event, regs, appUrl);
  gEl('event-regs-tbody').innerHTML    = registrationTableHTML(regs);
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
  const attended  = eventRegsForThis.filter(r => r.status === 'Attended').length;
  const totalRegs = eventRegsForThis.length;
  const suggested = (event.price || 0) * (attended || totalRegs || 1);
  openModal('Issue Invoice', eventInvoiceFormHTML(event, totalRegs, attended, suggested, todayISO()), saveIssueEventInvoice);
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
