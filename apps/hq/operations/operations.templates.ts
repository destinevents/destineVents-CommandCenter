import type { Partner, Document as HQDocument, ImpactEntry, Client, Project } from '@shared/types.ts';
import { escapeHtml, docTypeIcon } from '@shared/utils/helpers.ts';

// ── Partner templates ─────────────────────────────────────────────────────────

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

// ── Document templates ────────────────────────────────────────────────────────

export function documentListHTML(docs: HQDocument[]): string {
  return docs.length
    ? docs.map(d => `
        <div class="doc-item" style="cursor:pointer" onclick="openDocPreview(${d.id})">
          <div class="doc-icon">${docTypeIcon(d.type ?? '')}</div>
          <div style="flex:1">
            <div class="doc-name">${escapeHtml(d.name)}</div>
            <div class="doc-meta">${escapeHtml(d.type || '—')} · ${escapeHtml(d.size || '—')} · ${escapeHtml(d.date || '—')}</div>
          </div>
          <span class="doc-btn">View →</span>
        </div>`).join('')
    : `<div class="empty-state">No documents yet — upload your first file above</div>`;
}

export function docPreviewHTML(signedUrl: string | null, name: string): string {
  if (!signedUrl) {
    return `<div style="text-align:center;padding:40px 24px">
      <div style="font-size:36px;margin-bottom:12px">📄</div>
      <div style="font-size:13px;color:var(--ink-2);margin-bottom:6px">No preview available</div>
      <div style="font-size:11px;color:var(--ink-3)">File path is missing — this entry may have been created manually.</div>
    </div>`;
  }
  const ext = (name || '').split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') {
    return `<iframe src="${signedUrl}" style="width:100%;height:100%;min-height:500px;border:none;display:block"></iframe>`;
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
    return `<img src="${signedUrl}" alt="${escapeHtml(name)}" style="max-width:100%;max-height:70vh;object-fit:contain;display:block;margin:auto;padding:20px">`;
  }
  return `<div style="text-align:center;padding:40px 24px">
    <div style="font-size:36px;margin-bottom:12px">📄</div>
    <div style="font-size:13px;color:var(--ink-2);margin-bottom:6px">${escapeHtml(name)}</div>
    <div style="font-size:11px;color:var(--ink-3)">Use the Download button to open this file.</div>
  </div>`;
}

export function docTagFormHTML(fileName: string, clients: Client[], projects: Project[]): string {
  const clientOpts  = `<option value="">— no client —</option>` +
    clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  const projectOpts = `<option value="">— no project —</option>` +
    projects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  return `<div style="font-size:12px;color:var(--ink-2);margin-bottom:12px">Uploading: <strong>${escapeHtml(fileName)}</strong></div>
  <div class="form-grid">
    <div class="form-group full"><div class="form-label">Client (optional)</div><select class="form-input" id="doc-ctx-client">${clientOpts}</select></div>
    <div class="form-group full"><div class="form-label">Project (optional)</div><select class="form-input" id="doc-ctx-project">${projectOpts}</select></div>
  </div>`;
}

// ── Impact templates ──────────────────────────────────────────────────────────

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
