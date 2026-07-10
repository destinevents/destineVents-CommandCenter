function renderTable(config) {
  const {
    containerId,
    theadHTML,
    tbodyId,
    data,
    rowFn,
    emptyMsg,
    emptyIcon,
    wrapperClass
  } = config;

  const container = document.getElementById(containerId);
  if (!container) return;

  if (!data || data.length === 0) {
    container.innerHTML = `<div class="empty-state">
      ${emptyIcon ? `<div class="empty-state-icon">${emptyIcon}</div>` : ''}
      ${emptyMsg || 'No data found.'}
    </div>`;
    return;
  }

  const rows = data.map(rowFn).join('');
  container.innerHTML = `<div class="${wrapperClass || 'table-wrap'}">
    <table class="tbl">
      <thead><tr>${theadHTML}</tr></thead>
      <tbody id="${tbodyId}">${rows}</tbody>
    </table>
  </div>`;
}

function renderTableRows(tbodyId, data, rowFn, emptyMsg, emptyIcon) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  if (!data || data.length === 0) {
    const table = tbody.closest('table');
    if (table) {
      const wrap = table.closest('.table-wrap, .surface');
      if (wrap) {
        tbody.innerHTML = '';
        const existing = wrap.querySelector('.empty-state');
        if (!existing) {
          const es = document.createElement('div');
          es.className = 'empty-state';
          if (emptyIcon) es.innerHTML = `<div class="empty-icon">${emptyIcon}</div>`;
          es.appendChild(document.createTextNode(emptyMsg || 'No data found.'));
          wrap.appendChild(es);
        }
      }
    }
    return;
  }

  tbody.innerHTML = data.map(rowFn).join('');
}
