export type UserRole =
  | 'admin'
  | 'supervisor'
  | 'intern'
  | 'pending'
  | 'freelancer'
  | 'finance_officer'
  | 'external_accountant'
  | 'team_staff';

export type TaskStatus =
  | 'assigned'
  | 'acknowledged'
  | 'in_progress'
  | 'on_hold'
  | 'completed'
  | 'reviewed';

export type TimesheetStatus = 'pending' | 'approved' | 'rejected';

export interface InternUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar: string;
  school: string | null;
  program: string | null;
  required_hours: number | null;
  requested_role?: UserRole | null;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  assigned_to: string | null;
  created_by: string;
  output_type: string | null;
  output_link: string | null;
  created_at: string;
}

export interface Timesheet {
  id: string;
  intern_id: string;
  date: string;
  hours: number;
  description: string;
  skills: string[];
  status: TimesheetStatus;
  created_at: string;
}

export interface ServiceResult<T> {
  data: T | null;
  error: { message: string } | null;
}

export interface TaskStats {
  total: number;
  active: number;
  completed: number;
  byStatus: Record<TaskStatus, number>;
}

export interface TimesheetStats {
  total: number;
  approvedHours: number;
  pendingHours: number;
  totalHours: number;
  approvedCount: number;
  pendingCount: number;
}

export interface SkillFrequency {
  skill: string;
  count: number;
}

export interface TaskAction {
  action: string;
  label: string;
  style: string;
}

// HQ Domain Types
export interface Client {
  id: number;
  name: string;
  type: string | null;
  brand: string | null;
  status: string | null;
  contact: string | null;
  email: string | null;
  total_value: number;
  created_at: string;
}

export interface Proposal {
  id: number;
  name: string;
  client: string | null;
  value: number;
  sent: string | null;
  followup: string | null;
  status: string;
  created_at: string;
  // Document Engine fields
  quo_number: string | null;
  client_tin: string | null;
  business_address: string | null;
  subtotal: number | null;
  vat_amount: number | null;
  total_amount: number | null;
  valid_until: string | null;
  prepared_by: string | null;
  notes: string | null;
  archived_at: string | null;
}

export interface ProposalLineItem {
  id?: number;
  proposal_id?: number;
  description: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  created_at?: string;
}

export interface Partner {
  id: number;
  name: string;
  type: string | null;
  contact: string | null;
  email: string | null;
  project_id: number | null;
  created_at: string;
}

export interface InvoiceLineItem {
  id?: number;
  invoice_id?: number;
  description: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  created_at?: string;
}

export interface Invoice {
  id: number;
  or_num: string;
  client: string | null;
  amount: number;
  subtotal: number | null;
  vat_amount: number | null;
  discount: number | null;
  notes: string | null;
  date: string | null;
  due: string | null;
  status: string;
  payment_method: string | null;
  payment_reference: string | null;
  payment_date: string | null;
  received_by: string | null;
  tin: string | null;
  business_address: string | null;
  project_id: number | null;
  event_id: number | null;
  archived_at: string | null;
  payment_id: string | null;
  payment_url: string | null;
  paymongo_link_id: string | null;
  created_at: string;
}

export interface Bill {
  id: number;
  expense_number: string | null;
  payee: string;
  vendor: string | null;
  amount: number;
  date: string | null;
  due_date: string | null;
  category: string | null;
  invoice_number: string | null;
  purchase_order: string | null;
  receipt_url: string | null;
  ewt: string;
  status: string;
  // When the expense was actually settled. Distinct from `date` (the bill's own
  // date) so "Paid This Month" reflects the month cash left, not the month the
  // supplier dated their invoice. Nullable for rows predating the migration.
  paid_at: string | null;
  remarks: string | null;
  partner_id: number | null;
  project_id: number | null;
  archived_at: string | null;
  approved_by: string | null;
  created_by: string | null;
  modified_by: string | null;
  created_at: string;
}

export interface PayrollRun {
  id: number;
  payroll_number: string | null;
  period: string;
  employee_name: string | null;
  employee_type: 'Employee' | 'Freelancer' | 'Intern' | 'Contractor' | null;
  employees: number;
  hours_worked: number | null;
  basic_pay: number;
  overtime: number;
  allowances: number;
  gross: number;
  deductions: number;
  net: number;
  status: string;
  released_by: string | null;
  // When the payslip was actually released. See the note on Bill.paid_at.
  released_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface PurchaseOrder {
  id: number;
  po_number: string;
  vendor: string;
  project_id: number | null;
  issue_date: string | null;
  delivery_date: string | null;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  status: string;                // Draft | Sent | Approved | Fulfilled | Cancelled
  notes: string | null;
  prepared_by: string | null;
  approved_by: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface POLineItem {
  id?: number;
  po_id?: number;
  description: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  created_at?: string;
}

export interface Contract {
  id: number;
  con_number: string;
  client: string;
  project_id: number | null;
  title: string;
  contract_date: string | null;
  start_date: string | null;
  end_date: string | null;
  value: number;
  status: string;              // Draft | Sent | Signed | Active | Completed | Terminated
  terms: string | null;
  prepared_by: string | null;
  signed_by: string | null;
  signed_at: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface Document {
  id: number;
  name: string;
  type: string | null;
  size: string | null;
  date: string | null;
  url: string | null;
  path: string | null;
  client_id: number | null;
  project_id: number | null;
  proposal_id: number | null;
  created_at: string;
}

export interface Event {
  id: number;
  name: string;
  brand: string;
  event_type: string | null;
  date: string | null;
  venue: string | null;
  capacity: number;
  price: number;
  status: string;
  description: string | null;
  created_at: string;
}

export interface EventRegistration {
  id: number;
  event_id: number | null;
  name: string;
  email: string;
  phone: string | null;
  organization: string | null;
  status: string;
  registered_at: string;
  payment_id: string | null;
  payment_status: string | null;
}

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'cancelled';
export type PaymentType = 'event_ticket' | 'invoice';

export interface Payment {
  id: string;
  external_id: string | null;
  checkout_url: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  type: PaymentType;
  reference_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface SOBLineItem {
  id?: number;
  sob_id?: number;
  description: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  created_at?: string;
}

export interface SOB {
  id: number;
  sob_num: string;
  client: string | null;
  project_id: number | null;
  issue_date: string | null;
  due_date: string | null;
  currency: string;
  description: string | null;
  subtotal: number;
  discount: number;
  vat_amount: number;
  total_amount: number;
  payment_instructions: string | null;
  notes: string | null;
  prepared_by: string | null;
  approved_by: string | null;
  status: string;
  linked_invoice_id: number | null;
  archived_at: string | null;
  created_at: string;
}

export interface BirFiling {
  id: number;
  form: string;
  period: string;
  tax_base: number;
  tax_due: number;
  reference_no: string | null;
  notes: string | null;
  filed_at: string;
  created_at: string;
}

export interface Project {
  id: number;
  name: string;
  code: string | null;            // human code, auto PRJ-YYYY-NNN when blank
  client: string | null;
  brand: string | null;
  category: string | null;
  value: number;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImpactEntry {
  id: number;
  period: string;
  program: string;
  students_reached: number;
  teachers_trained: number;
  smes_supported: number;
  lgus_engaged: number;
  project_id: number | null;
  created_at: string;
}

export interface ProposalStats {
  total: number;
  closed: number;
  won: number;
  lost: number;
  // Still live: not Won, Lost or Expired. Counts the same quotations that
  // pipelineValue sums, so the figure and its caption always agree.
  open: number;
  winRate: number;
  wonValue: number;
  pipelineValue: number;
}

export interface FinanceSummary {
  arOutstanding: number;
  apOutstanding: number;
  netPosition: number;
  revenueCollected: number;
  collectedThisMonth: number;
  expensesPaid: number;
  netProfit: number;
  overdueCount: number;
  overdueTotal: number;
  pendingBillsCount: number;
  payrollDue: number;
  cashFlowThisMonth: number;
  collectedToday: number;
  avgCollectionDays: number;
}

export type ProjectCreateResult =
  | { ok: true; data: Project }
  | { ok: false; message: string };

// ─── Cash Ledger / Financial Accounts / Founder Capital ──────────────────────
export type AccountType = 'cash' | 'bank' | 'ewallet';

export interface FinancialAccount {
  id: number;
  name: string;
  type: AccountType;
  opening_balance: number;
  is_active: boolean;
  is_default: boolean;            // account AR/AP/Payroll auto-posts into
  notes: string | null;
  created_at: string;
}

export interface CashLedgerEntry {
  id: number;
  reference_no: string | null;
  txn_date: string | null;
  description: string;
  company: string | null;         // which business the cash belongs to
  project_id: number | null;
  category: string | null;
  module_source: string;          // Manual | Founder | AR | AP | Payroll
  payment_method: string | null;
  account_id: number | null;
  cash_in: number;
  cash_out: number;
  created_by: string | null;
  attachment_url: string | null;
  notes: string | null;
  source_type: string | null;     // invoice | bill | payroll — links to the origin doc
  source_id: number | null;
  created_at: string;
}

export type FounderTransactionType = 'Capital Contribution' | 'Owner Withdrawal';

export interface FounderCapitalEntry {
  id: number;
  reference_no: string | null;
  txn_date: string | null;
  founder: string;
  transaction_type: FounderTransactionType;
  amount: number;
  account_id: number | null;
  ledger_id: number | null;       // the auto-posted cash_ledger row
  notes: string | null;
  created_at: string;
}

export interface Budget {
  id: number;
  category: string;
  period_year: number;
  period_month: number | null;    // null = annual budget; 1-12 = monthly
  amount: number;
  notes: string | null;
  created_at: string;
}

export interface Meeting {
  id: number;
  client_id: number | null;
  stage: string;
  status: string;
  title: string | null;
  start_datetime: string | null;
  end_datetime: string | null;
  meeting_notes: string | null;
  google_meet_link: string | null;
  calendar_event_link: string | null;
  google_event_id: string | null;
  recording_link: string | null;
  created_at: string;
  updated_at: string;
}
