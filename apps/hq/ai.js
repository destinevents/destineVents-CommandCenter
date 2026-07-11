import { toast } from './ui.js';

export function selectTemplate(el) {
  document.querySelectorAll('.ai-template').forEach(t=>t.classList.remove('selected'));
  el.classList.add('selected');
}

export function copyAIOutput() {
  const text = document.getElementById('ai-result').innerText;
  navigator.clipboard.writeText(text).then(()=>toast('Copied to clipboard','success'));
}

function buildAIPrompt(template, client, project, context) {
  const base = `You are a professional business writer for DestineVents Collective OPC, an event management and community development company in Baguio City, Philippines. Write in a warm, professional, and confident tone. Be concise and specific.`;
  const c = client || 'the client', p = project || 'our collaboration', x = context ? '\nContext: ' + context : '';
  const map = {
    'Follow-up Email':  `${base}\n\nWrite a professional follow-up email to ${c} regarding "${p}".${x}\nInclude: subject line, greeting, brief re-cap, clear next step, and warm closing from Jennifer Castro, Founder.`,
    'Proposal Summary': `${base}\n\nWrite an executive proposal summary for ${c} for the project "${p}".${x}\nInclude: intro, scope overview, key deliverables (3-4 bullets), investment note, and compelling close.`,
    'Project Brief':    `${base}\n\nWrite a structured project brief for "${p}" with ${c}.${x}\nInclude: overview, objectives (3 points), scope of work, timeline note, and team note.`,
    'Monthly Report':   `${base}\n\nWrite a monthly business performance report for DestineVents.${x ? x : '\nCurrent month: ' + new Date().toLocaleDateString('en-US',{month:'long',year:'numeric'})}\nInclude: highlights, projects update, financials note, partnerships, next month outlook.`,
    'Impact Summary':   `${base}\n\nWrite a social impact narrative for "${p}" with ${c}.${x}\nInclude: program overview, key impact figures, beneficiaries, and CSR value statement.`,
    'Annual Report':    `${base}\n\nWrite an annual report narrative for DestineVents Collective OPC.${x}\nInclude: year in review, key achievements (3-5 points), financial highlights, community impact, partnerships, vision ahead.`,
  };
  return map[template] || map['Follow-up Email'];
}

export async function simulateAI() {
  const client  = document.getElementById('ai-client').value.trim();
  const project = document.getElementById('ai-project').value.trim();
  const context = document.getElementById('ai-context').value.trim();
  const templateName = document.querySelector('.ai-template.selected .ai-template-name')?.textContent || 'Follow-up Email';
  const r = document.getElementById('ai-result');

  r.style.color = '';
  r.style.whiteSpace = '';
  r.innerHTML = '<div class="ai-generating"><div class="dot-pulse"><span></span><span></span><span></span></div>&nbsp; Generating…</div>';

  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: buildAIPrompt(templateName, client, project, context) }],
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
