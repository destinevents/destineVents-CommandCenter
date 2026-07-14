// ICC-only component — converted in place from skillPicker.js (no classic copy needed).
import { SKILL_LIST } from '@shared/constants.ts';

export function renderSkillPicker(pickerId: string, selectId: string): void {
  const picker = document.getElementById(pickerId);
  const select = document.getElementById(selectId) as HTMLSelectElement | null;
  if (!picker || !select) return;

  select.innerHTML = SKILL_LIST.map(s => `<option value="${s}">${s}</option>`).join('');
  picker.innerHTML = SKILL_LIST.map(s =>
    `<button type="button" class="skill-tag" data-value="${s}">${s}</button>`
  ).join('');

  picker.onclick = e => {
    const btn = (e.target as HTMLElement).closest('.skill-tag');
    if (!btn) return;
    btn.classList.toggle('selected');
    [...select.options].forEach(opt => {
      opt.selected = !!picker.querySelector(`.skill-tag[data-value="${opt.value}"].selected`);
    });
  };
}

export function resetSkillPicker(pickerId: string): void {
  document.getElementById(pickerId)
    ?.querySelectorAll('.skill-tag.selected')
    .forEach(b => b.classList.remove('selected'));
}
