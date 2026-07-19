import type { ImpactEntry, Project } from '@shared/types.ts';
import { escapeHtml } from '@shared/utils/helpers.ts';

export function impactEntriesHTML(entries: ImpactEntry[], projects: Project[]): string {
  return entries.length
    ? entries.map(e => {
        const proj = e.project_id ? projects.find(p => p.id === e.project_id) : null;
        return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--ink-4);font-size:12px">
          <div>
            <div style="font-weight:600;color:var(--ink)">${escapeHtml(e.period)} — ${escapeHtml(e.program)}</div>
            <div style="color:var(--ink-3);font-size:10.5px;margin-top:2px">
              ${e.students_reached || 0} students · ${e.teachers_trained || 0} teachers · ${e.smes_supported || 0} SMEs · ${e.lgus_engaged || 0} LGUs${proj ? ` · <span style="color:var(--blue)">${escapeHtml(proj.name)}</span>` : ''}
            </div>
          </div>
          <div class="flex-gap" style="gap:4px;flex-shrink:0">
            <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="openEditImpact(${e.id})">Edit</button>
            <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--red)" onclick="handleDeleteImpact(${e.id})">Delete</button>
          </div>
        </div>`;
      }).join('')
    : '<div style="color:var(--ink-3);font-size:11.5px;padding:8px 0">No entries yet — log your first entry.</div>';
}

export function impactFormHTML(projects: Project[], e: Partial<ImpactEntry> = {}): string {
  const projectOpts = `<option value="">— no project —</option>` +
    projects.map(p => `<option value="${p.id}"${e.project_id === p.id ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
  return `<div class="form-grid">
    <div class="form-group"><div class="form-label">Period</div><input class="form-input" id="imp-edit-period" value="${escapeHtml(e.period || '')}" placeholder="e.g. Q1 2026"/></div>
    <div class="form-group"><div class="form-label">Program</div><input class="form-input" id="imp-edit-program" value="${escapeHtml(e.program || '')}" placeholder="e.g. MSME Capacity Building"/></div>
    <div class="form-group"><div class="form-label">Students Reached</div><input class="form-input" id="imp-edit-students" type="number" value="${e.students_reached || 0}" min="0"/></div>
    <div class="form-group"><div class="form-label">Teachers Trained</div><input class="form-input" id="imp-edit-teachers" type="number" value="${e.teachers_trained || 0}" min="0"/></div>
    <div class="form-group"><div class="form-label">SMEs Supported</div><input class="form-input" id="imp-edit-smes" type="number" value="${e.smes_supported || 0}" min="0"/></div>
    <div class="form-group"><div class="form-label">LGUs Engaged</div><input class="form-input" id="imp-edit-lgus" type="number" value="${e.lgus_engaged || 0}" min="0"/></div>
    <div class="form-group full"><div class="form-label">Project (optional)</div><select class="form-input" id="imp-edit-project">${projectOpts}</select></div>
  </div>`;
}
