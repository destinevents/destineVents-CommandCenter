function renderUserChip(initials, name, role, avatarSize) {
  const size = avatarSize || 26;
  const fontSize = Math.round(size * 0.34);
  return `<div class="user-chip">
    <div class="avatar" style="width:${size}px;height:${size}px;font-size:${fontSize}px">${initials}</div>
    <div>
      <div class="uname">${escapeHtml(name)}</div>
      ${role ? `<div class="urole">${escapeHtml(role)}</div>` : ''}
    </div>
  </div>`;
}
