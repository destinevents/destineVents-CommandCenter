export function calcFinanceSummary(invoices: any[], bills: any[]) {
  const arOutstanding = invoices
    .filter((i) => i.status !== 'Paid')
    .reduce((s, i) => s + (i.amount || 0), 0);
  const apOutstanding = bills
    .filter((b) => b.status !== 'Paid')
    .reduce((s, b) => s + (b.amount || 0), 0);
  const revenueCollected = invoices
    .filter((i) => i.status === 'Paid')
    .reduce((s, i) => s + (i.amount || 0), 0);
  const overdueInvoices = invoices.filter((i) => i.status === 'Overdue');
  const pendingBills = bills.filter((b) => b.status !== 'Paid');
  return {
    arOutstanding,
    apOutstanding,
    netPosition: revenueCollected - apOutstanding,
    revenueCollected,
    overdueCount: overdueInvoices.length,
    overdueTotal: overdueInvoices.reduce((s, i) => s + (i.amount || 0), 0),
    pendingBillsCount: pendingBills.length,
  };
}
