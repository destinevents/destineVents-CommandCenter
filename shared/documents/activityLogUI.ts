import { fetchDocActivity } from '@shared/services/documents/activityLogService.ts';
import { openModal } from '@hq/core/ui.ts';
import { escapeHtml } from '@shared/utils/helpers.ts';

const ACTION_ICON: Record<string, string> = {
  created:    '✦',
  updated:    '✎',
  sent:       '✉',
  viewed:     '👁',
  approved:   '✓',
  rejected:   '✗',
  paid:       '₱',
  released:   '▶',
  downloaded: '↓',
  archived:   '▣',
  cancelled:  '⊘',
  submitted:  '→',
  signed:     '✍',
  fulfilled:  '✔',
};

const ACTION_COLOR: Record<string, string> = {
  created:    'var(--blue)',
  updated:    'var(--ink-2)',
  sent:       'var(--blue)',
  viewed:     'var(--ink-3)',
  approved:   'var(--green)',
  rejected:   'var(--red)',
  paid:       'var(--green)',
  released:   'var(--green)',
  downloaded: 'var(--ink-2)',
  archived:   'var(--ink-3)',
  cancelled:  'var(--ink-3)',
  submitted:  'var(--amber)',
  signed:     'var(--green)',
  fulfilled:  'var(--green)',
};

export async function openDocActivityLog(
  docType: string,
  docId: number,
  docLabel: string,
): Promise<void> {
  openModal(
    `Activity — ${docLabel}`,
    `<div style="text-align:center;padding:24px;color:var(--ink-3);font-size:13px">Loading activity…</div>`,
    null,
    'Close',
  );

  const logs = await fetchDocActivity(docType as Parameters<typeof fetchDocActivity>[0], docId);

  const bodyEl = document.getElementById('modal-body');
  if (!bodyEl) return;

  if (!logs.length) {
    bodyEl.innerHTML = `<div style="text-align:center;padding:32px;color:var(--ink-3);font-size:13px">No activity recorded yet.</div>`;
    return;
  }

  bodyEl.innerHTML = `
    <div style="position:relative;padding-left:28px">
      <div style="position:absolute;left:8px;top:8px;bottom:0;width:2px;background:var(--ink-4)"></div>
      ${logs.map((log, i) => {
        const icon  = ACTION_ICON[log.action]  ?? '·';
        const color = ACTION_COLOR[log.action] ?? 'var(--ink-3)';
        const date  = new Date(log.created_at).toLocaleString('en-PH', {
          month: 'short', day: 'numeric', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        });
        return `
          <div style="position:relative;margin-bottom:${i < logs.length - 1 ? '20px' : '0'}">
            <div style="position:absolute;left:-24px;top:2px;width:16px;height:16px;border-radius:50%;
                        background:${color};color:#fff;font-size:9px;display:flex;align-items:center;
                        justify-content:center;font-weight:700">${icon}</div>
            <div style="font-size:13px;font-weight:600;color:var(--ink);text-transform:capitalize">${escapeHtml(log.action)}</div>
            <div style="font-size:11px;color:var(--ink-3);margin-top:2px">
              ${log.performed_by ? `<span style="color:var(--ink-2)">${escapeHtml(log.performed_by)}</span> · ` : ''}${date}
            </div>
            ${log.notes ? `<div style="font-size:11px;color:var(--ink-3);margin-top:3px;font-style:italic">${escapeHtml(log.notes)}</div>` : ''}
          </div>`;
      }).join('')}
    </div>`;
}
