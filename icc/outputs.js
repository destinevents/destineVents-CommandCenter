// Re-render when any toolbar control changes (toolbar is static HTML, so
// re-rendering the grid doesn't steal focus from the search input)
['output-search', 'output-type-filter', 'output-sort'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener(id === 'output-search' ? 'input' : 'change', () => renderOutputs());
});

async function renderOutputs() {
  const q    = document.getElementById('output-search').value.trim().toLowerCase();
  const type = document.getElementById('output-type-filter').value;
  const sort = document.getElementById('output-sort').value;

  let tasks = myTasks().filter(t=>t.output_type);
  if (q) tasks = tasks.filter(t => {
    const intern = user(t.assigned_to);
    return (t.title || '').toLowerCase().includes(q) ||
      (t.industry_category || '').toLowerCase().includes(q) ||
      (intern.name || '').toLowerCase().includes(q);
  });
  if (type !== 'all') tasks = tasks.filter(t => t.output_type === type);
  const byNewest = (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0);
  tasks = [...tasks].sort(sort === 'oldest' ? (a, b) => byNewest(b, a) : byNewest);

  document.getElementById('outputs-grid').innerHTML = tasks.map(t=>{
    const intern = user(t.assigned_to);
    return `<div class="out-card">
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
  }).join('') || `<div class="empty-state"><div class="empty-icon">📦</div>${(q || type !== 'all') ? 'No outputs match your filters.' : 'No outputs yet.'}</div>`;
}
