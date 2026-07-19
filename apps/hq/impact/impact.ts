import { validateRequired } from '@shared/utils/validators.ts';
import { fetchImpactEntries, createImpactEntry, updateImpactEntry, deleteImpactEntry } from './impactService.ts';
import { fetchProjects } from '@hq/projects/projectService.ts';
import { _projects, _impactEntries, setImpactEntries, setProjects } from '@hq/core/state.ts';
import { toast, openModal, closeModal } from '@hq/core/ui.ts';
import { impactEntriesHTML, impactFormHTML } from './impact.templates.ts';

const gEl = (id: string) => document.getElementById(id)!;
const gVal = (id: string) => (document.getElementById(id) as HTMLInputElement).value;

export async function loadImpact() {
  const [entries, projs] = await Promise.all([fetchImpactEntries(), _projects.length ? _projects : fetchProjects()]);
  setImpactEntries(entries);
  if (!_projects.length) setProjects(projs || []);
  const sel = document.getElementById('imp-project');
  if (sel) {
    sel.innerHTML = `<option value="">— no project —</option>` +
      _projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  }
  renderImpact();
}

export function renderImpact() {
  const totals = { students: 0, teachers: 0, smes: 0, lgus: 0 };
  _impactEntries.forEach(e => {
    totals.students += e.students_reached || 0;
    totals.teachers += e.teachers_trained || 0;
    totals.smes     += e.smes_supported   || 0;
    totals.lgus     += e.lgus_engaged     || 0;
  });
  gEl('imp-total-students').textContent = totals.students.toLocaleString();
  gEl('imp-total-teachers').textContent = totals.teachers.toLocaleString();
  gEl('imp-total-smes').textContent     = totals.smes.toLocaleString();
  gEl('imp-total-lgus').textContent     = totals.lgus.toLocaleString();
  gEl('impact-entries').innerHTML       = impactEntriesHTML(_impactEntries, _projects);
}

export async function saveImpactEntry() {
  const period  = gVal('imp-period').trim();
  const program = gVal('imp-program').trim();
  const err = validateRequired(period, 'Period') || validateRequired(program, 'Program');
  if (err) { toast(err, 'error'); return; }
  const projVal = (document.getElementById('imp-project') as HTMLInputElement | null)?.value;
  const result = await createImpactEntry({
    period,
    program,
    students_reached: +gVal('imp-students') || 0,
    teachers_trained: +gVal('imp-teachers') || 0,
    smes_supported:   +gVal('imp-smes')     || 0,
    lgus_engaged:     +gVal('imp-lgus')     || 0,
    project_id:       projVal ? +projVal : null,
  });
  if (!result) { toast('Could not save impact entry. Please try again.', 'error'); return; }
  toast('Impact entry saved', 'success');
  ['imp-period', 'imp-program', 'imp-students', 'imp-teachers', 'imp-smes', 'imp-lgus'].forEach(id => {
    (document.getElementById(id) as HTMLInputElement).value = '';
  });
  const projSel = document.getElementById('imp-project') as HTMLInputElement | null;
  if (projSel) projSel.value = '';
  loadImpact();
}

export async function handleDeleteImpact(id: number) {
  if (!confirm('Delete this impact entry? This cannot be undone.')) return;
  const ok = await deleteImpactEntry(id);
  if (!ok) { toast('Could not delete entry', 'error'); return; }
  toast('Entry deleted', '');
  loadImpact();
}

let _editingImpactId: number | null = null;

export function openEditImpact(id: number) {
  const e = _impactEntries.find(x => x.id === id);
  if (!e) return;
  _editingImpactId = id;
  openModal('Edit Impact Entry', impactFormHTML(_projects, e), saveImpactEdit);
}

async function saveImpactEdit() {
  if (!_editingImpactId) return;
  const period  = gVal('imp-edit-period').trim();
  const program = gVal('imp-edit-program').trim();
  const err = validateRequired(period, 'Period') || validateRequired(program, 'Program');
  if (err) { toast(err, 'error'); return; }
  const editProjVal = (document.getElementById('imp-edit-project') as HTMLInputElement | null)?.value;
  const ok = await updateImpactEntry(_editingImpactId, {
    period,
    program,
    students_reached: +gVal('imp-edit-students') || 0,
    teachers_trained: +gVal('imp-edit-teachers') || 0,
    smes_supported:   +gVal('imp-edit-smes')     || 0,
    lgus_engaged:     +gVal('imp-edit-lgus')     || 0,
    project_id:       editProjVal ? +editProjVal : null,
  });
  if (!ok) { toast('Could not update entry', 'error'); return; }
  toast('Impact entry updated', 'success');
  _editingImpactId = null;
  closeModal();
  loadImpact();
}
