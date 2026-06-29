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

function formatBytes(b) {
  if (b < 1024)       return b + ' B';
  if (b < 1024*1024)  return Math.round(b/1024) + ' KB';
  return (b/1024/1024).toFixed(1) + ' MB';
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

function skillPill(s){ return `<span class="skill-pill">${s}</span>`; }

function skillPillGreen(s){ return `<span class="skill-pill-green">${s}</span>`; }
