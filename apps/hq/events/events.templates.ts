import type { Event, EventRegistration } from '@shared/types.ts';
import { escapeHtml } from '@shared/utils/helpers.ts';
import { formatCurrency } from '@shared/utils/formatUtils.ts';
import { formatDateShort } from '@shared/utils/dateUtils.ts';
import { APP_SETTINGS } from '@config/settings.ts';

function statusBadgeClass(status: string): string {
  const map: Record<string, string> = { Upcoming: 'blue', Active: 'green', Completed: 'gray', Cancelled: 'red' };
  return map[status] || 'gray';
}

function regCount(allRegs: EventRegistration[], eventId: number): number {
  return allRegs.filter(r => r.event_id == eventId).length;
}

function statusOptions(current: string): string {
  return ['Registered', 'Attended', 'No-show', 'Cancelled']
    .map(s => `<option${s === current ? ' selected' : ''}>${s}</option>`).join('');
}

// ── Events list templates ─────────────────────────────────────────────────────

export function eventsStatsHTML(events: Event[], allRegs: EventRegistration[]): string {
  const upcoming  = events.filter(e => e.status === 'Upcoming').length;
  const totalRegs = events.reduce((s, e) => s + regCount(allRegs, e.id), 0);
  const revenue   = events.filter(e => e.status === 'Completed')
    .reduce((s, e) => s + (e.price || 0) * regCount(allRegs, e.id), 0);
  return `
    <div class="stat-card"><div class="stat-accent" style="background:var(--gold)"></div>
      <div class="stat-label">Total Events</div><div class="stat-value">${events.length}</div></div>
    <div class="stat-card"><div class="stat-accent" style="background:var(--blue)"></div>
      <div class="stat-label">Upcoming</div><div class="stat-value">${upcoming}</div></div>
    <div class="stat-card"><div class="stat-accent" style="background:var(--green)"></div>
      <div class="stat-label">Registrations</div><div class="stat-value">${totalRegs}</div></div>
    <div class="stat-card"><div class="stat-accent" style="background:var(--ink-1)"></div>
      <div class="stat-label">Est. Revenue</div><div class="stat-value" style="font-size:18px">${formatCurrency(revenue)}</div></div>`;
}

export function eventRowHTML(e: Event, allRegs: EventRegistration[], appUrl: string): string {
  const regs   = regCount(allRegs, e.id);
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
}

export function eventTableHTML(list: Event[], allRegs: EventRegistration[], appUrl: string): string {
  return list.length
    ? list.map(e => eventRowHTML(e, allRegs, appUrl)).join('')
    : `<tr><td colspan="8"><div class="empty-state">No events yet — create your first one</div></td></tr>`;
}

// ── Event detail templates ────────────────────────────────────────────────────

export function eventDetailHeaderHTML(event: Event, regs: EventRegistration[], appUrl: string): string {
  const attended = regs.filter(r => r.status === 'Attended').length;
  const noshow   = regs.filter(r => r.status === 'No-show').length;
  const regUrl   = `${appUrl}/register.html?event=${event.id}`;
  return `
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
}

export function registrationRowHTML(r: EventRegistration): string {
  return `<tr>
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
  </tr>`;
}

export function registrationTableHTML(regs: EventRegistration[]): string {
  return regs.length
    ? regs.map(registrationRowHTML).join('')
    : `<tr><td colspan="6"><div class="empty-state">No registrations yet</div></td></tr>`;
}

// ── Event form template ───────────────────────────────────────────────────────

export function eventFormHTML(e: Partial<Event> = {}): string {
  const brandOpts  = APP_SETTINGS.company.brands.map((b: string) => `<option${b === e.brand ? ' selected' : ''}>${b}</option>`).join('');
  const typeOpts   = APP_SETTINGS.events.types.map((t: string) => `<option${t === e.event_type ? ' selected' : ''}>${t}</option>`).join('');
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

// ── Event invoice form template ───────────────────────────────────────────────

export function eventInvoiceFormHTML(
  event: Event,
  totalRegs: number,
  attended: number,
  suggested: number,
  todayDate: string,
): string {
  return `<div class="form-grid">
    <div class="form-group"><div class="form-label">OR Number</div><input class="form-input" id="eiv-or" placeholder="OR-2026-001"/></div>
    <div class="form-group"><div class="form-label">Client / Payee</div><input class="form-input" id="eiv-client" value="${escapeHtml(event.name)}" placeholder="Client name"/></div>
    <div class="form-group"><div class="form-label">Amount (₱)</div><input class="form-input" id="eiv-amount" type="number" value="${suggested}" min="0"/></div>
    <div class="form-group"><div class="form-label">Status</div>
      <select class="form-input" id="eiv-status">
        <option>Unpaid</option><option>Paid</option>
      </select>
    </div>
    <div class="form-group"><div class="form-label">Date Issued</div><input class="form-input" id="eiv-date" type="date" value="${todayDate}"/></div>
    <div class="form-group"><div class="form-label">Due Date</div><input class="form-input" id="eiv-due" type="date"/></div>
    <div class="form-group full" style="font-size:11px;color:var(--ink-3)">
      ${totalRegs} registered · ${attended} attended · ₱${(event.price || 0).toLocaleString()} per ticket
    </div>
  </div>`;
}
