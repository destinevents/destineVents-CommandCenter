function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtDate(isoVal) {
  if (!isoVal) return '—';
  return new Date(isoVal + 'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
}

const num = n =>(+(n)||0).toLocaleString('en-PH');

function statusClass(s='') {
  return ({
    'Active':'active','Completed':'completed','NDA Signed':'nda','Lead':'lead','Proposal':'proposal',
    'Paid':'paid','Unpaid':'unpaid','Overdue':'overdue',
    'Won':'won','Lost':'lost','Sent':'sent','Expired':'expired',
    'Released':'released','Pending':'pending','Draft':'draft',
  })[s] || 'lead';
}

function docTypeIcon(t) {
  return {'NDA':'📋','Contract':'📄','Proposal':'📝','Agreement':'🤝','Document':'📁'}[t]||'📁';
}

function guessDocType(name) {
  const n = name.toLowerCase();
  if (n.includes('nda'))                            return 'NDA';
  if (n.includes('contract'))                       return 'Contract';
  if (n.includes('proposal'))                       return 'Proposal';
  if (n.includes('agreement') || n.includes('mou')) return 'Agreement';
  return 'Document';
}

function badge(val){ return `<span class="badge badge-${val}">${STATUS_LABELS[val]||val}</span>`; }

function pBadge(val){ return `<span class="badge badge-${val}">${val.charAt(0).toUpperCase()+val.slice(1)}</span>`; }

function avatarEl(initials, size=32, color="#252f27"){
  return `<div class="avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size*0.34)}px;background:${color}">${initials}</div>`;
}

function debounce(fn, wait = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// Wires a static filter toolbar to a render function: text inputs re-render
// debounced as the user types; selects and date inputs re-render on change.
function attachFilterToolbar(ids, renderFn) {
  const debounced = debounce(() => renderFn(), 200);
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const isTextInput = el.tagName === 'INPUT' && el.type === 'text';
    el.addEventListener(isTextInput ? 'input' : 'change', isTextInput ? debounced : () => renderFn());
  });
}

// Paged-rendering state for "Load more" lists: render list.slice(0, pager.limit),
// call pager.loadMore() from the button, pager.reset() when filters change.
function createPager(pageSize, rerender) {
  return {
    limit: pageSize,
    pageSize,
    reset() { this.limit = this.pageSize; },
    loadMore() {
      this.limit += this.pageSize;
      rerender();
    },
  };
}

// Appends the shared OUTPUT_TYPES options after the select's placeholder option
function populateOutputTypeSelect(id) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.insertAdjacentHTML(
    'beforeend',
    Object.entries(OUTPUT_TYPES).map(([v, label]) => `<option value="${v}">${label}</option>`).join('')
  );
}

function skillPill(s){ return `<span class="skill-pill">${s}</span>`; }

function skillPillGreen(s){ return `<span class="skill-pill-green">${s}</span>`; }
