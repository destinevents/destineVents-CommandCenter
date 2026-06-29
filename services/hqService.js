async function fetchClients() {
  return sb.from('clients').select('*').order('name');
}

async function createClient(data) {
  return sb.from('clients').insert(data);
}

async function fetchProposals() {
  return sb.from('proposals').select('*').order('sent', { ascending: false });
}

async function createProposal(data) {
  return sb.from('proposals').insert(data);
}

async function fetchPartners() {
  return sb.from('partners').select('*').order('name');
}

async function createPartner(data) {
  return sb.from('partners').insert(data);
}

async function fetchDocuments() {
  return sb.from('documents').select('*').order('created_at', { ascending: false });
}

async function fetchInvoices() {
  return sb.from('invoices').select('*').order('date', { ascending: false });
}

async function createInvoice(data) {
  return sb.from('invoices').insert(data);
}

async function fetchBills() {
  return sb.from('bills').select('*').order('date', { ascending: false });
}

async function createBill(data) {
  return sb.from('bills').insert(data);
}

async function fetchPayrollRuns() {
  return sb.from('payroll_runs').select('*').order('period', { ascending: false });
}

async function createPayrollRun(data) {
  return sb.from('payroll_runs').insert(data);
}

async function uploadDocument(file, path) {
  return sb.storage.from('documents').upload(path, file);
}

function getDocumentPublicUrl(path) {
  return sb.storage.from('documents').getPublicUrl(path).data.publicUrl;
}

async function saveDocumentMeta(data) {
  return sb.from('documents').insert(data);
}
