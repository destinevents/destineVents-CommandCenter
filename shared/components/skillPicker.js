function renderSkillPicker(pickerId, selectId) {
  const picker = document.getElementById(pickerId);
  const select = document.getElementById(selectId);
  if (!picker || !select) return;

  select.innerHTML = SKILL_LIST.map(s => `<option value="${s}">${s}</option>`).join('');
  picker.innerHTML = SKILL_LIST.map(s =>
    `<button type="button" class="skill-tag" data-value="${s}">${s}</button>`
  ).join('');

  picker.onclick = e => {
    const btn = e.target.closest('.skill-tag');
    if (!btn) return;
    btn.classList.toggle('selected');
    [...select.options].forEach(opt => {
      opt.selected = !!picker.querySelector(`.skill-tag[data-value="${opt.value}"].selected`);
    });
  };
}

function resetSkillPicker(pickerId) {
  document.getElementById(pickerId)
    ?.querySelectorAll('.skill-tag.selected')
    .forEach(b => b.classList.remove('selected'));
}
