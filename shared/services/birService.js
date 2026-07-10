async function fetchBirFilings() {
  const { data, error } = await sb
    .from('bir_filings')
    .select('*')
    .order('filed_at', { ascending: false });
  if (error) { logger.error('fetchBirFilings', error.message, error); return []; }
  return data || [];
}

async function createBirFiling(filing) {
  const { data, error } = await sb.from('bir_filings').insert(filing).select().single();
  if (error) { logger.error('createBirFiling', error.message, error); showToast('Could not save filing record.', 'error', 3000); return null; }
  return data;
}
