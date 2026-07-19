import type { Document as HQDocument, Client, Project } from '@shared/types.ts';
import { escapeHtml, docTypeIcon } from '@shared/utils/helpers.ts';

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
