async function fetchProposals() {
  const { data, error } = await sb.from('proposals').select('*').order('sent', { ascending: false });
  if (error) { handleServiceError('fetchProposals', error); return []; }
  return data;
}

async function createProposal(data) {
  const { data: result, error } = await sb.from('proposals').insert(data).select();
  if (error) { handleServiceError('createProposal', error); return null; }
  return result?.[0] || null;
}

function calcWinRate(proposals) {
  const closed = proposals.filter(p => p.status === 'Won' || p.status === 'Lost');
  const won = proposals.filter(p => p.status === 'Won');
  const wonValue = won.reduce((s, p) => s + (p.value || 0), 0);
  const pipelineValue = proposals.filter(p => p.status === 'Sent').reduce((s, p) => s + (p.value || 0), 0);
  return {
    total: proposals.length,
    closed: closed.length,
    won: won.length,
    lost: proposals.filter(p => p.status === 'Lost').length,
    winRate: closed.length ? Math.round((won.length / closed.length) * 100) : 0,
    wonValue,
    pipelineValue,
  };
}

// Node/Vitest export — tests run against this shipped file. No-op in browser.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calcWinRate };
}
