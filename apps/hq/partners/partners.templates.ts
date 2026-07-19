import type { Partner, Project } from '@shared/types.ts';
import { escapeHtml } from '@shared/utils/helpers.ts';

export function partnerGridHTML(list: Partner[]): string {
  return list.length
    ? list.map(p => `
        <div class="partner-card">
          <div class="partner-type-tag">${escapeHtml(p.type)}</div>
          <div class="partner-name">${escapeHtml(p.name)}</div>
          <div class="partner-contact">${escapeHtml(p.contact) || ''}<br>${escapeHtml(p.email) || ''}</div>
          <div class="flex-gap" style="gap:4px;margin-top:10px">
            <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;flex:1" onclick="openEditPartner(${p.id})">Edit</button>
            <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--red)" onclick="handleDeletePartner(${p.id})">Delete</button>
          </div>
        </div>`).join('')
    : `<div style="grid-column:1/-1"><div class="empty-state">No partners in this category</div></div>`;
}

export function partnerFormHTML(projects: Project[], p: Partial<Partner> = {}): string {
  const typeOpts    = ['School', 'LGU', 'NGO', 'Sponsor', 'Media', 'Startup']
    .map(t => `<option${t === p.type ? ' selected' : ''}>${t}</option>`).join('');
  const projectOpts = `<option value="">— no project —</option>` +
    projects.map(pr => `<option value="${pr.id}"${p.project_id === pr.id ? ' selected' : ''}>${escapeHtml(pr.name)}</option>`).join('');
  return `<div class="form-grid">
    <div class="form-group full"><div class="form-label">Organization Name</div><input class="form-input" id="fpr-name" value="${escapeHtml(p.name || '')}" placeholder="e.g. BLISTT Consortium"/></div>
    <div class="form-group"><div class="form-label">Type</div><select class="form-input" id="fpr-type">${typeOpts}</select></div>
    <div class="form-group"><div class="form-label">Contact Person</div><input class="form-input" id="fpr-contact" value="${escapeHtml(p.contact || '')}" placeholder="Full name"/></div>
    <div class="form-group full"><div class="form-label">Email</div><input class="form-input" id="fpr-email" type="email" value="${escapeHtml(p.email || '')}" placeholder="email@org.ph"/></div>
    <div class="form-group full"><div class="form-label">Project (optional)</div><select class="form-input" id="fpr-project">${projectOpts}</select></div>
  </div>`;
}
