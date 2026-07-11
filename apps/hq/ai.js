import { escapeHtml } from '../../shared/utils/helpers.ts';
import { todayISO } from '../../shared/utils/dateUtils.ts';
import { fetchClients } from '../../shared/services/clientService.js';
import { fetchProjects } from '../../shared/services/projectService.js';
import { fetchProposals } from '../../shared/services/proposalService.js';
import { fetchInvoices } from '../../shared/services/financeService.js';
import { uploadDocument, saveDocumentMeta, getDocumentPublicUrl } from '../../shared/services/documentService.js';
import { _clients, _projects, _proposals, _invoices, setClients, setProjects, setProposals, setInvoices } from './state.js';
import { toast } from './ui.js';

export async function initAIAutocomplete() {
  const [clients, projects] = await Promise.all([
    _clients.length ? _clients : fetchClients(),
    _projects.length ? _projects : fetchProjects(),
  ]);
  if (!_clients.length) setClients(clients || []);
  if (!_projects.length) setProjects(projects || []);

  const cl = document.getElementById('ai-client-list');
  const pl = document.getElementById('ai-project-list');
  if (cl) cl.innerHTML = (clients || []).map(c => `<option value="${escapeHtml(c.name)}"/>`).join('');
  if (pl) pl.innerHTML = (projects || []).map(p => `<option value="${escapeHtml(p.name)}"/>`).join('');
}

export function selectTemplate(el) {
  document.querySelectorAll('.ai-template').forEach(t => t.classList.remove('selected'));
  el.classList.add('selected');
}

export function copyAIOutput() {
  const text = document.getElementById('ai-result').innerText;
  navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard', 'success'));
}

export async function saveAIOutput() {
  const text = document.getElementById('ai-result').innerText?.trim();
  if (!text || text.startsWith('Your generated')) { toast('Nothing to save yet', 'error'); return; }
  const templateName = document.querySelector('.ai-template.selected .ai-template-name')?.textContent || 'AI Output';
  const client = document.getElementById('ai-client').value.trim();
  const filename = `${templateName.replace(/\s+/g, '-')}${client ? '-' + client.replace(/\s+/g, '-') : ''}-${todayISO()}.txt`;
  try {
    toast('Saving to Documents…');
    const blob = new Blob([text], { type: 'text/plain' });
    const file = new File([blob], filename, { type: 'text/plain' });
    const path = `ai-outputs/${Date.now()}-${filename}`;
    const uploaded = await uploadDocument(file, path);
    if (!uploaded) { toast('Could not upload — check Documents storage bucket', 'error'); return; }
    const url = getDocumentPublicUrl(path);
    const clientRecord = _clients.find(c => c.name.toLowerCase() === client.toLowerCase());
    await saveDocumentMeta({
      name: filename, type: 'AI Output',
      size: `${(blob.size / 1024).toFixed(1)} KB`,
      date: todayISO(), url, path,
      client_id: clientRecord?.id || null,
    });
    toast('Saved to Documents', 'success');
  } catch (e) {
    toast(`Save failed: ${e.message}`, 'error');
  }
}

async function fetchAIContextData(clientName, projectName) {
  const [proposals, invoices] = await Promise.all([
    _proposals.length ? _proposals : fetchProposals(),
    _invoices.length ? _invoices : fetchInvoices(),
  ]);
  if (!_proposals.length) setProposals(proposals || []);
  if (!_invoices.length) setInvoices(invoices || []);

  const matchClient = n => n?.toLowerCase() === clientName.toLowerCase();
  const matchProject = n => n?.toLowerCase() === projectName.toLowerCase();

  const clientRecord = _clients.find(c => matchClient(c.name));
  const projectRecord = _projects.find(p => matchProject(p.name));
  const clientProposals = clientName ? (proposals || []).filter(p => matchClient(p.client)) : [];
  const clientInvoices  = clientName ? (invoices || []).filter(i => matchClient(i.client))  : [];

  return { clientRecord, projectRecord, clientProposals, clientInvoices };
}

function buildAIPrompt(template, client, project, context, contextData) {
  const base = `You are a professional business writer for DestineVents Collective OPC, an event management and community development company in Baguio City, Philippines. Write in a warm, professional, and confident tone. Be concise and specific.`;
  const c = client || 'the client';
  const p = project || 'our collaboration';
  const x = context ? '\nContext: ' + context : '';

  let dataContext = '';
  if (contextData) {
    const { clientRecord, projectRecord, clientProposals, clientInvoices } = contextData;
    const lines = [];
    if (clientRecord) lines.push(`Client status: ${clientRecord.status}, Type: ${clientRecord.type}`);
    if (projectRecord) lines.push(`Project: ${projectRecord.name} (${projectRecord.status}, ${projectRecord.category || '—'}, ₱${(projectRecord.value || 0).toLocaleString()})`);
    if (clientProposals.length) {
      const recent = clientProposals.slice(0, 3).map(pr => `${pr.name} (${pr.status}, ₱${(pr.value || 0).toLocaleString()})`).join('; ');
      lines.push(`Recent proposals: ${recent}`);
    }
    if (clientInvoices.length) {
      const paid = clientInvoices.filter(i => i.status === 'Paid').reduce((s, i) => s + (i.amount || 0), 0);
      const owed = clientInvoices.filter(i => i.status !== 'Paid').reduce((s, i) => s + (i.amount || 0), 0);
      lines.push(`Invoice history: ₱${paid.toLocaleString()} paid, ₱${owed.toLocaleString()} outstanding`);
    }
    if (lines.length) dataContext = '\nCRM Data:\n' + lines.map(l => '- ' + l).join('\n');
  }

  const fullContext = x + dataContext;

  const map = {
    'Follow-up Email':  `${base}\n\nWrite a professional follow-up email to ${c} regarding "${p}".${fullContext}\nInclude: subject line, greeting, brief re-cap, clear next step, and warm closing from Jennifer Castro, Founder.`,
    'Proposal Summary': `${base}\n\nWrite an executive proposal summary for ${c} for the project "${p}".${fullContext}\nInclude: intro, scope overview, key deliverables (3-4 bullets), investment note, and compelling close.`,
    'Project Brief':    `${base}\n\nWrite a structured project brief for "${p}" with ${c}.${fullContext}\nInclude: overview, objectives (3 points), scope of work, timeline note, and team note.`,
    'Monthly Report':   `${base}\n\nWrite a monthly business performance report for DestineVents.${fullContext || '\nCurrent month: ' + new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}\nInclude: highlights, projects update, financials note, partnerships, next month outlook.`,
    'Impact Summary':   `${base}\n\nWrite a social impact narrative for "${p}" with ${c}.${fullContext}\nInclude: program overview, key impact figures, beneficiaries, and CSR value statement.`,
    'Annual Report':    `${base}\n\nWrite an annual report narrative for DestineVents Collective OPC.${fullContext}\nInclude: year in review, key achievements (3-5 points), financial highlights, community impact, partnerships, vision ahead.`,
  };
  return map[template] || map['Follow-up Email'];
}

export async function simulateAI() {
  const client       = document.getElementById('ai-client').value.trim();
  const project      = document.getElementById('ai-project').value.trim();
  const context      = document.getElementById('ai-context').value.trim();
  const templateName = document.querySelector('.ai-template.selected .ai-template-name')?.textContent || 'Follow-up Email';
  const r            = document.getElementById('ai-result');

  r.style.color      = '';
  r.style.whiteSpace = '';
  r.innerHTML = '<div class="ai-generating"><div class="dot-pulse"><span></span><span></span><span></span></div>&nbsp; Generating…</div>';

  try {
    const contextData = (client || project) ? await fetchAIContextData(client, project) : null;
    const prompt = buildAIPrompt(templateName, client, project, context, contextData);

    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.error?.message || (typeof err.error === 'string' ? err.error : null) || `HTTP ${res.status}`;
      throw new Error(msg);
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '(no output)';
    r.textContent = text;
    r.style.whiteSpace = 'pre-line';
  } catch (e) {
    const isNetworkError = e.message.includes('Failed to fetch') || e.message.includes('NetworkError') || e.message.includes('ERR_CONNECTION');
    const msg = isNetworkError
      ? 'AI endpoint is not reachable. In local development, run npm run dev:full (uses vercel dev). In production, deploy to Vercel with ANTHROPIC_API_KEY set.'
      : e.message;
    r.style.color = 'var(--red)';
    r.style.whiteSpace = 'normal';
    r.textContent = msg;
    toast('AI generation failed', 'error');
  }
}
