import { openModal, closeModal, toast } from '@hq/core/ui.ts';
import { escapeHtml } from '@shared/utils/helpers.ts';

export interface DocEmailOptions {
  modalTitle: string;
  /** One-line summary shown above the form e.g. "SOB-2026-001 · ₱10,000 · Due Jul 30" */
  docSummary: string;
  defaultSubject: string;
  defaultBody: string;
  /** Hint shown below the form e.g. "Download the PDF first to attach it." */
  pdfHint?: string;
  onSend: (to: string, cc: string, subject: string, body: string) => Promise<void>;
}

export function openDocEmail(opts: DocEmailOptions): void {
  const { modalTitle, docSummary, defaultSubject, defaultBody, pdfHint, onSend } = opts;

  openModal(
    modalTitle,
    `<div style="font-size:11px;color:var(--ink-3);margin-bottom:12px">${escapeHtml(docSummary)}</div>
    <div class="form-grid">
      <div class="form-group full"><div class="form-label">To (Recipient Email) *</div><input class="form-input" id="dem-to" type="email" placeholder="recipient@example.com"/></div>
      <div class="form-group full"><div class="form-label">CC (optional)</div><input class="form-input" id="dem-cc" type="email" placeholder="colleague@example.com"/></div>
      <div class="form-group full"><div class="form-label">Subject</div><input class="form-input" id="dem-subject" value="${escapeHtml(defaultSubject)}"/></div>
      <div class="form-group full"><div class="form-label">Message</div><textarea class="form-input" id="dem-body" rows="8" style="font-size:11.5px;line-height:1.6">${escapeHtml(defaultBody)}</textarea></div>
    </div>
    ${pdfHint ? `<div style="font-size:10.5px;color:var(--ink-3);margin-top:8px">${escapeHtml(pdfHint)}</div>` : ''}`,
    async () => {
      const to      = (document.getElementById('dem-to')      as HTMLInputElement).value.trim();
      const cc      = (document.getElementById('dem-cc')      as HTMLInputElement).value.trim();
      const subject = (document.getElementById('dem-subject') as HTMLInputElement).value.trim();
      const body    = (document.getElementById('dem-body')    as HTMLTextAreaElement).value.trim();
      if (!to) { toast('Recipient email is required', 'error'); return; }
      const ccPart = cc ? `&cc=${encodeURIComponent(cc)}` : '';
      window.open(`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}${ccPart}&body=${encodeURIComponent(body)}`);
      await onSend(to, cc, subject, body);
      closeModal();
    },
    'Open Email Client',
  );
}
