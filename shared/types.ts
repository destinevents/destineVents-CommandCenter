export type UserRole = 'admin' | 'supervisor' | 'intern';

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
