export type UserRole =
  | 'admin'
  | 'supervisor'
  | 'intern'
  | 'pending'
  | 'finance_officer'
  | 'external_accountant'
  | 'team_staff';

export type TaskStatus =
  | 'assigned'
  | 'acknowledged'
  | 'in_progress'
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
  project_id: number | null;
  event_id: number | null;
  payment_id: string | null;
  payment_url: string | null;
  paymongo_link_id: string | null;
  created_at: string;
}

export interface Bill {
  id: number;
  payee: string;
  amount: number;
  date: string | null;
  category: string | null;
  ewt: string;
  status: string;
  partner_id: number | null;
  created_at: string;
}

export interface PayrollRun {
  id: number;
  period: string;
  employees: number;
  gross: number;
  deductions: number;
  net: number;
  status: string;
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
}

export type ProjectCreateResult =
  | { ok: true; data: Project }
  | { ok: false; message: string };
