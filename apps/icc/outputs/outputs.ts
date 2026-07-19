// @ts-nocheck
import { createPager, attachFilterToolbar, escapeHtml, badge, avatarEl, skillPill } from '@shared/utils/helpers.ts';
import { OUTPUT_ICONS } from '@shared/constants.ts';
import { liveUsers, myTasks } from '../core/state.ts';

export const outputPager = createPager(30, () => renderOutputs());

attachFilterToolbar(['output-search', 'output-type-filter', 'output-sort'], () => {
  outputPager.reset();
  renderOutputs();
});

export async function renderOutputs() {
  const q    = document.getElementById('output-search').value.trim().toLowerCase();
  const type = document.getElementById('output-type-filter').value;
  const sort = document.getElementById('output-sort').value;
  const userById = new Map(liveUsers.map(u => [u.id, u]));

  let tasks = myTasks().filter(t=>t.output_type);
  if (q) tasks = tasks.filter(t => {
    const intern = userById.get(t.assigned_to) || {};
    return (t.title || '').toLowerCase().includes(q) ||
      (t.industry_category || '').toLowerCase().includes(q) ||
      (intern.name || '').toLowerCase().includes(q);
  });
  if (type !== 'all') tasks = tasks.filter(t => t.output_type === type);
  const byNewest = (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0);
  tasks = [...tasks].sort(sort === 'oldest' ? (a, b) => byNewest(b, a) : byNewest);
  const totalCount = tasks.length;
  const visible = tasks.slice(0, outputPager.limit);

  document.getElementById('outputs-grid').innerHTML = visible.map((t, i)=>{
    const intern = userById.get(t.assigned_to) || {};
    return `<div class="out-card stagger-item" style="--i:${i}">
      <div class="out-card-head">
        <span style="font-size:26px">${OUTPUT_ICONS[t.output_type]||'📦'}</span>
        <div>
          <div class="out-card-type">${t.output_type.replace('_',' ').toUpperCase()}</div>
          <div class="out-card-cat">${t.industry_category}</div>
        </div>
      </div>
      <div class="out-card-body">
        <div class="out-card-name">${escapeHtml(t.title)}</div>
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:9px">${avatarEl(intern.avatar||'?',20)}<span style="font-size:11px;color:var(--muted)">${escapeHtml(intern.name)||'—'}</span></div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px">${(t.skills||[]).map(skillPill).join('')}</div>
        <div class="flex-between">
          ${badge(t.status)}
          ${t.output_link?`<a href="${t.output_link}" target="_blank" style="font-size:11px;color:#C9A84C;font-weight:600">View →</a>`:`<span style="font-size:11px;color:var(--faint)">No link yet</span>`}
        </div>
      </div>
    </div>`;
  }).join('') + (totalCount > visible.length
    ? `<button class="kan-more-btn" data-action="output-load-more" style="grid-column:1/-1">Load more (showing ${visible.length} of ${totalCount})</button>`
    : '') || `<div class="empty-state"><div class="empty-icon">📦</div>${(q || type !== 'all') ? 'No outputs match your filters.' : 'No outputs yet.'}</div>`;
}
