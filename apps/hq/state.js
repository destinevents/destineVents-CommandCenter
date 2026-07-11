// ─── HQ SHARED STATE (leaf module — imports nothing) ─────────────────────────
// Live bindings for reads; reassignment via setters (module imports are
// read-only views in the importer).
export let _clients = [];
export function setClients(v) { _clients = v; }

export let _proposals = [];
export function setProposals(v) { _proposals = v; }

export let _partners = [];
export function setPartners(v) { _partners = v; }

export let _documents = [];
export function setDocuments(v) { _documents = v; }

export let _invoices = [];
export function setInvoices(v) { _invoices = v; }

export let _bills = [];
export function setBills(v) { _bills = v; }

export let _payroll = [];
export function setPayroll(v) { _payroll = v; }

export let _projects = [];
export function setProjects(v) { _projects = v; }

export let _impactEntries = [];
export function setImpactEntries(v) { _impactEntries = v; }

export let _birFilings = [];
export function setBirFilings(v) { _birFilings = v; }

export let _events = [];
export function setEvents(v) { _events = v; }

export let _eventRegs = [];
export function setEventRegs(v) { _eventRegs = v; }

export let _currentEvent = null;
export function setCurrentEvent(v) { _currentEvent = v; }
