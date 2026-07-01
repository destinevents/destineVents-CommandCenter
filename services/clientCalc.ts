export function getClientTotalValue(clients: any[]): number {
  return clients.reduce((s, c) => s + (c.total_value || 0), 0);
}

export function findClientByName(name: string | null | undefined, clients: any[]): any | null {
  if (!name || !clients) return null;
  return clients.find((c) => c.name?.toLowerCase() === name.toLowerCase()) || null;
}
