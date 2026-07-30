// ─── HQ SHARED STATE (leaf module — imports nothing) ─────────────────────────
// Live bindings for reads; reassignment via setters (module imports are
// read-only views in the importer).
import type {
  Client, Proposal, Partner, Document, Invoice, Bill,
  PayrollRun, Project, ImpactEntry, BirFiling, Event, EventRegistration, SOB, UserRole, Meeting,
  PurchaseOrder, FinancialAccount, CashLedgerEntry, FounderCapitalEntry, Budget,
} from '@shared/types.ts';

export let _userRole: UserRole = 'admin';
export function setUserRole(v: UserRole): void { _userRole = v; }

export let _clients: Client[] = [];
export function setClients(v: Client[]): void { _clients = v; }

export let _proposals: Proposal[] = [];
export function setProposals(v: Proposal[]): void { _proposals = v; }

export let _partners: Partner[] = [];
export function setPartners(v: Partner[]): void { _partners = v; }

export let _documents: Document[] = [];
export function setDocuments(v: Document[]): void { _documents = v; }

export let _invoices: Invoice[] = [];
export function setInvoices(v: Invoice[]): void { _invoices = v; }

export let _bills: Bill[] = [];
export function setBills(v: Bill[]): void { _bills = v; }

export let _payroll: PayrollRun[] = [];
export function setPayroll(v: PayrollRun[]): void { _payroll = v; }

export let _projects: Project[] = [];
export function setProjects(v: Project[]): void { _projects = v; }

export let _impactEntries: ImpactEntry[] = [];
export function setImpactEntries(v: ImpactEntry[]): void { _impactEntries = v; }

export let _birFilings: BirFiling[] = [];
export function setBirFilings(v: BirFiling[]): void { _birFilings = v; }

export let _events: Event[] = [];
export function setEvents(v: Event[]): void { _events = v; }

export let _eventRegs: EventRegistration[] = [];
export function setEventRegs(v: EventRegistration[]): void { _eventRegs = v; }

export let _currentEvent: Event | null = null;
export function setCurrentEvent(v: Event | null): void { _currentEvent = v; }

export let _sobs: SOB[] = [];
export function setSOBs(v: SOB[]): void { _sobs = v; }

export let _meetings: Meeting[] = [];
export function setMeetings(v: Meeting[]): void { _meetings = v; }

export let _pos: PurchaseOrder[] = [];
export function setPOs(v: PurchaseOrder[]): void { _pos = v; }

export let _accounts: FinancialAccount[] = [];
export function setAccounts(v: FinancialAccount[]): void { _accounts = v; }

export let _ledger: CashLedgerEntry[] = [];
export function setLedger(v: CashLedgerEntry[]): void { _ledger = v; }

export let _founderCapital: FounderCapitalEntry[] = [];
export function setFounderCapital(v: FounderCapitalEntry[]): void { _founderCapital = v; }

export let _budgets: Budget[] = [];
export function setBudgets(v: Budget[]): void { _budgets = v; }
