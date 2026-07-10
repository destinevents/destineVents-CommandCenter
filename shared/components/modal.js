function modalOpen(id) {
  const el = typeof id === 'string' ? document.getElementById(id) : id;
  if (el) el.classList.add('open');
}

function modalClose(id) {
  const el = typeof id === 'string' ? document.getElementById(id) : id;
  if (el) el.classList.remove('open');
}

function createModalHTML(id, title, bodyHTML, footerHTML, wide) {
  return `<div class="modal-overlay" id="${id}">
    <div class="modal-box${wide ? ' wide' : ''}">
      <div class="modal-header">
        <span class="modal-title">${title}</span>
        <button class="modal-close" data-action="close-modal" data-modal="${id}">&times;</button>
      </div>
      <div class="modal-body">${bodyHTML}</div>
      ${footerHTML ? `<div class="modal-footer">${footerHTML}</div>` : ''}
    </div>
  </div>`;
}

function setupModalDismiss() {
  document.addEventListener('click', function(e) {
    const overlay = e.target.closest('.modal-overlay');
    if (overlay && e.target === overlay) {
      overlay.classList.remove('open');
    }
  });
}
