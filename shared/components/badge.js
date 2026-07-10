function renderBadge(val) {
  return `<span class="badge badge-${val}">${STATUS_LABELS[val] || val}</span>`;
}

function renderPriorityBadge(val) {
  return `<span class="badge badge-${val}">${val.charAt(0).toUpperCase() + val.slice(1)}</span>`;
}
