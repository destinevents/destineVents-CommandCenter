import { formatCurrency } from '../../shared/utils/formatUtils.ts';
import { formatDateShort, todayISO } from '../../shared/utils/dateUtils.ts';
import { escapeHtml, statusClass } from '../../shared/utils/helpers.ts';
import { validateRequired } from '../../shared/utils/validators.ts';
import { fetchTimelogs, createTimelog, updateTimelog, deleteTimelog } from '../../shared/services/timelogService.js';
import { _timelogs, setTimelogs } from './state.js';
import { toast, openModal, closeModal } from './ui.js';

let _editingTimelogId = null;

export async function loadTimelogs() {
  const logs = await fetchTimelogs();
  setTimelogs(logs || []);
  renderTimelogs(_timelogs);
}

export function renderTimelogs(logs) {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const thisMonth = logs.filter(l => (l.date || '').startsWith(monthKey));

  const totalHours    = thisMonth.reduce((s, l) => s + (l.hours || 0), 0);
  const billableHours = thisMonth.filter(l => l.billable).reduce((s, l) => s + (l.hours || 0), 0);
  const billableValue = thisMonth
    .filter(l => l.billable && l.rate)
    .reduce((s, l) => s + (l.hours || 0) * (l.rate || 0), 0);

  document.getElementById('tl-stats').innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Total Hours (This Month)</div>
      <div class="stat-value">${totalHours.toFixed(1)}h</div>
      <div class="stat-change">${thisMonth.length} log${thisMonth.length !== 1 ? 's' : ''}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Billable Hours</div>
      <div class="stat-value">${billableHours.toFixed(1)}h</div>
      <div class="stat-change">${logs.filter(l => !l.billable && (l.date || '').startsWith(monthKey)).length} non-billable</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Billable Value</div>
      <div class="stat-value" style="font-size:22px">${formatCurrency(billableValue)}</div>
      <div class="stat-change up">At logged rates</div>
    </div>`;

  document.getElementById('tl-tbody').innerHTML = logs.length
    ? logs.map(l => `
        <tr>
          <td style="font-size:11px;color:var(--ink-3)">${formatDateShort(l.date)}</td>
          <td style="font-weight:500;color:var(--ink)">${escapeHtml(l.client || '—')}</td>
          <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(l.project || '—')}</td>
          <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(l.description)}</td>
          <td class="amount-cell">${(l.hours || 0).toFixed(1)}h</td>
          <td style="font-size:11px;color:var(--ink-3)">${l.rate ? formatCurrency(l.rate) + '/h' : '—'}</td>
          <td><span class="badge badge-${l.billable ? 'paid' : 'lead'}">${l.billable ? 'Billable' : 'Non-bill'}</span></td>
          <td><span class="badge badge-${l.status === 'Invoiced' ? 'paid' : 'unpaid'}">${escapeHtml(l.status || 'Logged')}</span></td>
          <td>
            <div class="flex-gap" style="gap:4px">
              <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="openEditTimelog(${l.id})">Edit</button>
              <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--red)" onclick="handleDeleteTimelog(${l.id})">Delete</button>
            </div>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="9"><div class="empty-state">No time logs yet — start tracking your freelance hours</div></td></tr>`;
}

function timelogFormHTML(l = {}) {
  return `<div class="form-grid">
    <div class="form-group"><div class="form-label">Date</div><input class="form-input" id="tl-date" type="date" value="${l.date || todayISO()}"/></div>
    <div class="form-group"><div class="form-label">Hours</div><input class="form-input" id="tl-hours" type="number" step="0.25" min="0.25" value="${l.hours || 1}"/></div>
    <div class="form-group"><div class="form-label">Client</div><input class="form-input" id="tl-client" value="${escapeHtml(l.client || '')}" placeholder="Client name"/></div>
    <div class="form-group"><div class="form-label">Project</div><input class="form-input" id="tl-project" value="${escapeHtml(l.project || '')}" placeholder="Project name"/></div>
    <div class="form-group full"><div class="form-label">Description</div><input class="form-input" id="tl-description" value="${escapeHtml(l.description || '')}" placeholder="What did you work on?"/></div>
    <div class="form-group"><div class="form-label">Hourly Rate (₱)</div><input class="form-input" id="tl-rate" type="number" value="${l.rate || ''}" placeholder="Optional"/></div>
    <div class="form-group"><div class="form-label">Billable?</div>
      <select class="form-input" id="tl-billable">
        <option value="1"${l.billable !== false ? ' selected' : ''}>Yes</option>
        <option value="0"${l.billable === false ? ' selected' : ''}>No</option>
      </select>
    </div>
    <div class="form-group"><div class="form-label">Status</div>
      <select class="form-input" id="tl-status">
        <option${l.status === 'Logged' || !l.status ? ' selected' : ''}>Logged</option>
        <option${l.status === 'Invoiced' ? ' selected' : ''}>Invoiced</option>
      </select>
    </div>
  </div>`;
}

export function openAddTimelog() {
  _editingTimelogId = null;
  openModal('Log Time', timelogFormHTML(), saveTimelog);
}

export function openEditTimelog(id) {
  const l = _timelogs.find(x => x.id === id);
  if (!l) return;
  _editingTimelogId = id;
  openModal('Edit Time Log', timelogFormHTML(l), saveTimelog);
}

export async function saveTimelog() {
  const description = document.getElementById('tl-description').value.trim();
  const err = validateRequired(description, 'Description');
  if (err) { toast(err, 'error'); return; }
  const rateVal = document.getElementById('tl-rate').value;
  const payload = {
    date:        document.getElementById('tl-date').value || todayISO(),
    hours:       +document.getElementById('tl-hours').value || 0,
    client:      document.getElementById('tl-client').value.trim() || null,
    project:     document.getElementById('tl-project').value.trim() || null,
    description,
    rate:        rateVal ? +rateVal : null,
    billable:    document.getElementById('tl-billable').value === '1',
    status:      document.getElementById('tl-status').value,
  };
  if (_editingTimelogId) {
    const ok = await updateTimelog(_editingTimelogId, payload);
    if (!ok) { toast('Could not update log', 'error'); return; }
    toast('Time log updated', 'success');
  } else {
    const result = await createTimelog(payload);
    if (!result) return;
    toast('Time logged', 'success');
  }
  closeModal();
  loadTimelogs();
}

export async function handleDeleteTimelog(id) {
  if (!confirm('Delete this time log?')) return;
  const ok = await deleteTimelog(id);
  if (!ok) { toast('Could not delete log', 'error'); return; }
  toast('Log deleted', '');
  loadTimelogs();
}
