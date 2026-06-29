async function fetchClients() {
  const { data, error } = await sb.from('clients').select('*').order('name');
  if (error) { handleServiceError('fetchClients', error); return []; }
  return data;
}

async function createClient(data) {
  const { data: result, error } = await sb.from('clients').insert(data).select();
  if (error) { handleServiceError('createClient', error); return null; }
  return result?.[0] || null;
}

async function getClientTotalValue(clients) {
  return clients.reduce((s, c) => s + (c.total_value || 0), 0);
}

async function findClientByName(name, clients) {
  if (!name || !clients) return null;
  return clients.find(c => c.name?.toLowerCase() === name.toLowerCase()) || null;
}
