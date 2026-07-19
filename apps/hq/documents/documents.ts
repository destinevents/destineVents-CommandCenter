import { formatBytes } from '@shared/utils/formatUtils.ts';
import { todayISO } from '@shared/utils/dateUtils.ts';
import { guessDocType } from '@shared/utils/helpers.ts';
import {
  fetchDocuments, uploadDocument, getDocumentPublicUrl, saveDocumentMeta,
  getDocumentSignedUrl, removeDocument,
} from './documentService.ts';
import { _documents, _clients, _projects, setDocuments } from '@hq/core/state.ts';
import { toast, openModal, closeModal } from '@hq/core/ui.ts';
import type { Document as HQDocument } from '@shared/types.ts';
import { documentListHTML, docPreviewHTML, docTagFormHTML } from './documents.templates.ts';

const gEl = (id: string) => document.getElementById(id)!

export function showDocumentsTab(name: string, el: HTMLElement) {
  document.querySelectorAll('#page-documents .vdtab').forEach(t => t.classList.remove('active'));
  gEl('vdtab-' + name).classList.add('active');
  document.querySelectorAll('#documents-subtabs .sub-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
};

let _previewDoc: HQDocument | null = null;

export async function loadDocuments() {
  setDocuments(await fetchDocuments());
  renderDocuments(_documents);
}

export function renderDocuments(docs: HQDocument[]) {
  gEl('doc-list').innerHTML = documentListHTML(docs);
}

export async function openDocPreview(id: number) {
  const doc = _documents.find(d => d.id === id);
  if (!doc) return;
  _previewDoc = doc;

  const overlay = gEl('doc-preview-overlay') as HTMLElement;
  overlay.style.display = 'flex';
  gEl('doc-preview-name').textContent = doc.name;
  gEl('doc-preview-meta').textContent =
    [doc.type, doc.size, doc.date].filter(Boolean).join(' · ');
  gEl('doc-preview-body').innerHTML =
    '<div style="color:var(--ink-3);font-size:12px">Loading preview…</div>';

  const signedUrl = doc.path ? await getDocumentSignedUrl(doc.path) : null;

  const dlBtn = gEl('doc-preview-download') as HTMLAnchorElement;
  if (signedUrl) {
    dlBtn.href = signedUrl;
    dlBtn.style.opacity = '';
    dlBtn.style.pointerEvents = '';
  } else {
    dlBtn.removeAttribute('href');
    dlBtn.style.opacity = '0.4';
    dlBtn.style.pointerEvents = 'none';
  }

  gEl('doc-preview-body').innerHTML = docPreviewHTML(signedUrl, doc.name);
}

export function closeDocPreview() {
  (gEl('doc-preview-overlay') as HTMLElement).style.display = 'none';
  _previewDoc = null;
}

export async function handleDeleteDocument() {
  if (!_previewDoc) return;
  if (!confirm(`Delete "${_previewDoc.name}"? This removes the file permanently.`)) return;
  const ok = await removeDocument(_previewDoc.id, _previewDoc.path);
  if (!ok) { toast('Could not delete document', 'error'); return; }
  toast('Document deleted', '');
  closeDocPreview();
  loadDocuments();
}

export function handleFileSelect(files: FileList) {
  if (!files || !files.length) return;
  const file = files[0];
  (gEl('file-input') as HTMLInputElement).value = '';
  openModal('Tag Document', docTagFormHTML(file.name, _clients, _projects), () => {
    const clientVal  = (document.getElementById('doc-ctx-client') as HTMLInputElement | null)?.value;
    const projectVal = (document.getElementById('doc-ctx-project') as HTMLInputElement | null)?.value;
    closeModal();
    uploadToStorage(file, clientVal ? +clientVal : null, projectVal ? +projectVal : null);
  });
}

export async function uploadToStorage(file: File, clientId: number | null = null, projectId: number | null = null) {
  toast('Uploading…');
  try {
    const path = `${Date.now()}-${file.name}`;
    const uploadResult = await uploadDocument(file, path);
    if (!uploadResult) {
      toast('Upload failed — check that the "documents" storage bucket exists in Supabase.', 'error');
      return;
    }
    const url = getDocumentPublicUrl(path);
    const saved = await saveDocumentMeta({
      name: file.name, type: guessDocType(file.name),
      size: formatBytes(file.size),
      date: todayISO(),
      url, path,
      client_id:  clientId  || null,
      project_id: projectId || null,
    });
    if (!saved) {
      toast('File uploaded but metadata could not be saved.', 'error');
      return;
    }
    toast('File uploaded', 'success');
    loadDocuments();
  } catch (err) {
    toast(`Upload error: ${(err as Error)?.message || 'Unknown error'}`, 'error');
  }
}
