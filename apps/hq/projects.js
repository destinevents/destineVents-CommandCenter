import { formatCurrency } from '../../shared/utils/formatUtils.ts';
import { formatDateShort } from '../../shared/utils/dateUtils.ts';
import { escapeHtml, statusClass } from '../../shared/utils/helpers.ts';
import { validateRequired } from '../../shared/utils/validators.ts';
import { APP_SETTINGS } from '../../config/settings.js';
import { fetchProjects, createProject } from '../../shared/services/projectService.js';
import { _projects, setProjects } from './state.js';
import { toast, openModal, closeModal } from './ui.js';

export async function loadProjects() {
  setProjects(await fetchProjects());
  renderProjects(_projects);
}

export function renderProjects(projects) {
  const total = projects.reduce((s, p) => s + (p.value || 0), 0);
  document.getElementById('projects-summary').textContent =
    `${projects.length} project${projects.length !== 1 ? 's' : ''} · ${formatCurrency(total)} total value`;

  document.getElementById('projects-tbody').innerHTML = projects.length
    ? projects.map(p => `
        <tr>
          <td>
            <div class="project-name">${escapeHtml(p.name)}</div>
            <div class="project-client">${escapeHtml(p.client || '—')}</div>
          </td>
          <td><span class="badge badge-${statusClass(p.status)}">${escapeHtml(p.status)}</span></td>
          <td style="font-size:11.5px;color:var(--ink-3)">${escapeHtml(p.category || '—')}</td>
          <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(p.brand || '—')}</td>
          <td class="project-value">${formatCurrency(p.value)}</td>
          <td style="font-size:10.5px;color:var(--ink-3)">${formatDateShort((p.updated_at || p.created_at || '').slice(0, 10))}</td>
        </tr>`).join('')
    : `<tr><td colspan="6"><div class="empty-state">No projects yet — start one with \\ New Project</div></td></tr>`;
}

export function openAddProject() {
  const brands    = (APP_SETTINGS.company.brands || ['DestineVents', 'DDC', 'AYA Baguio']).map(b => `<option>${escapeHtml(b)}</option>`).join('');
  const statuses  = ['Lead', 'Proposal Sent', 'NDA Signed', 'Active', 'Completed'].map(s => `<option>${s}</option>`).join('');
  const cats      = ['Events', 'Training', 'Digital', 'CSR', 'Community'].map(c => `<option>${c}</option>`).join('');
  openModal('New Project', `
    <div id="fp2-error" class="modal-error"></div>
    <div class="form-grid">
      <div class="form-group full"><div class="form-label">Project Name</div><input class="form-input" id="fp2-name" placeholder="e.g. DTI MSME Innovation Summit"/></div>
      <div class="form-group"><div class="form-label">Client</div><input class="form-input" id="fp2-client" placeholder="Client / org name"/></div>
      <div class="form-group"><div class="form-label">Value (₱)</div><input class="form-input" id="fp2-value" type="number" placeholder="0" min="0"/></div>
      <div class="form-group"><div class="form-label">Brand</div><select class="form-input" id="fp2-brand">${brands}</select></div>
      <div class="form-group"><div class="form-label">Category</div><select class="form-input" id="fp2-category">${cats}</select></div>
      <div class="form-group"><div class="form-label">Status</div><select class="form-input" id="fp2-status">${statuses}</select></div>
      <div class="form-group full"><div class="form-label">Notes</div><textarea class="form-input" id="fp2-notes" rows="2" placeholder="Any relevant details…"></textarea></div>
    </div>`, saveProject);
}

function showProjectError(msg) {
  const el = document.getElementById('fp2-error');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('visible');
}

export async function saveProject() {
  const name = document.getElementById('fp2-name').value.trim();
  const err  = validateRequired(name, 'Project name');
  if (err) { showProjectError(err); return; }
  const result = await createProject({
    name,
    client:   document.getElementById('fp2-client').value.trim(),
    value:    +document.getElementById('fp2-value').value || 0,
    brand:    document.getElementById('fp2-brand').value,
    category: document.getElementById('fp2-category').value,
    status:   document.getElementById('fp2-status').value,
    notes:    document.getElementById('fp2-notes').value.trim(),
    updated_at: new Date().toISOString(),
  });
  if (!result.ok) {
    showProjectError(result.message || 'Could not save project. Please try again.');
    return;
  }
  toast('Project added', 'success');
  closeModal();
  loadProjects();
}
