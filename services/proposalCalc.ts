export function calcWinRate(proposals: any[]) {
  const closed = proposals.filter(p => p.status === 'Won' || p.status === 'Lost');
  const won = proposals.filter(p => p.status === 'Won');
  const wonValue = won.reduce((s, p) => s + (p.value || 0), 0);
  const pipelineValue = proposals
    .filter(p => p.status === 'Sent')
    .reduce((s, p) => s + (p.value || 0), 0);
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
