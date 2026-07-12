// @ts-nocheck
import { escapeHtml, badge } from '../../shared/utils/helpers.ts';
import { liveTasks, liveTimesheets } from './state.ts';
import { openModal } from './ui.ts';

// ─── CALENDAR STATE ──────────────────────────────────────────────────────────
const _calNow = new Date();
let calYear  = _calNow.getFullYear();
let calMonth = _calNow.getMonth(); // 0-indexed

export function calPrev() {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
}

export function calNext() {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
}

export function calGoToToday() {
  const now = new Date();
  calYear  = now.getFullYear();
  calMonth = now.getMonth();
  renderCalendar();
}

export function calGoToStart() {
  if (!liveTimesheets.length) return;
  const earliest = liveTimesheets.reduce((min, ts) => ts.date < min ? ts.date : min, liveTimesheets[0].date);
  const parts = earliest.split('-');
  calYear  = parseInt(parts[0], 10);
  calMonth = parseInt(parts[1], 10) - 1;
  renderCalendar();
}

export function renderCalendar() {
  const label = new Date(calYear, calMonth, 1)
    .toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  document.getElementById('cal-month-label').textContent = label;

  // Build date → hours + entries maps from liveTimesheets
  const hoursMap   = {};
  const entriesMap = {};
  liveTimesheets.forEach(ts => {
    if (!hoursMap[ts.date]) { hoursMap[ts.date] = 0; entriesMap[ts.date] = []; }
    hoursMap[ts.date] += ts.hours;
    entriesMap[ts.date].push(ts);
  });

  const today   = new Date();
  const todayY  = today.getFullYear();
  const todayM  = today.getMonth();
  const todayD  = today.getDate();

  // First weekday of month (Mon=0 … Sun=6)
  const firstDow = (new Date(calYear, calMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  let html = DAY_NAMES.map(d => `<div class="cal-header-cell">${d}</div>`).join('');

  // Leading empty cells
  for (let i = 0; i < firstDow; i++) {
    html += '<div class="cal-day cal-day--outside"></div>';
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const hours   = hoursMap[dateStr] || 0;
    const isToday  = calYear === todayY && calMonth === todayM && day === todayD;
    const isFuture = new Date(calYear, calMonth, day) > today;

    let cls = 'cal-day';
    if (hours > 0)  cls += ' cal-day--has-hours';
    if (isToday)    cls += ' cal-day--today';
    if (isFuture)   cls += ' cal-day--future';

    html += `<div class="${cls}" data-date="${dateStr}">
      <span class="cal-day-num">${day}</span>
      ${hours > 0 ? `<span class="cal-day-hours">${hours}h</span>` : ''}
    </div>`;
  }

  // Trailing cells to fill last row
  const trailing = (7 - ((firstDow + daysInMonth) % 7)) % 7;
  for (let i = 0; i < trailing; i++) {
    html += '<div class="cal-day cal-day--outside"></div>';
  }

  document.getElementById('cal-grid').innerHTML = html;
  _attachCalendarEvents(entriesMap);
}

function _attachCalendarEvents(entriesMap) {
  const grid    = document.getElementById('cal-grid');
  const tooltip = document.getElementById('sb-cal-tooltip');

  grid.onmouseover = (e) => {
    const cell = e.target.closest('.cal-day[data-date]');
    if (!cell || cell.classList.contains('cal-day--outside')) {
      tooltip.style.display = 'none';
      return;
    }
    const entries  = entriesMap[cell.dataset.date] || [];
    const taskById = new Map(liveTasks.map(t => [t.id, t]));

    if (!entries.length) {
      tooltip.innerHTML = '<div class="cal-tip-empty">No entries</div>';
    } else {
      tooltip.innerHTML = entries.map(ts => {
        const task = taskById.get(ts.task_id);
        return `<div class="cal-tip-row">
          <span class="cal-tip-task">${escapeHtml(task?.title || 'No task')}</span>
          <span class="cal-tip-hours">${ts.hours}h</span>
          ${badge(ts.status)}
        </div>`;
      }).join('');
    }

    const rect = cell.getBoundingClientRect();
    tooltip.style.top  = (rect.bottom + 6) + 'px';
    tooltip.style.left = Math.min(rect.left, window.innerWidth - 220) + 'px';
    tooltip.style.display = 'block';
  };

  grid.onmouseleave = () => { tooltip.style.display = 'none'; };

  grid.onclick = (e) => {
    const cell = e.target.closest('.cal-day[data-date]');
    if (!cell || cell.classList.contains('cal-day--outside')) return;

    const date    = cell.dataset.date;
    const entries = entriesMap[date] || [];
    const taskById = new Map(liveTasks.map(t => [t.id, t]));

    const formatted = new Date(date + 'T00:00:00')
      .toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('modal-cal-day-title').textContent = formatted;

    if (!entries.length) {
      document.getElementById('modal-cal-day-body').innerHTML =
        '<div class="no-data" style="padding:20px 0">No entries for this day.</div>';
    } else {
      document.getElementById('modal-cal-day-body').innerHTML = entries.map(ts => {
        const task = taskById.get(ts.task_id);
        return `<div style="padding:12px 0;border-bottom:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
            <div>
              <div class="text-bold text-ink">${escapeHtml(task?.title || '—')}</div>
              <div class="text-xs text-muted mt-2">${escapeHtml(ts.activity_description || '')}</div>
              <div class="text-xs text-faint mt-2">${ts.industry_category || ''}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
              <span class="hours-display">${ts.hours}h</span>
              ${badge(ts.status)}
            </div>
          </div>
        </div>`;
      }).join('');
    }

    openModal('modal-cal-day');
  };
}
