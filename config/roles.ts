import type { UserRole } from '../js/shared/types';

export const ROLES = {
  ADMIN: 'admin',
  SUPERVISOR: 'supervisor',
  INTERN: 'intern',
} as const;

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 3,
  supervisor: 2,
  intern: 1,
};

type Resource =
  'tasks' | 'timesheets' | 'outputs' | 'dashboard' | 'approvals' | 'interns' | 'reports';

export const PERMISSIONS: Record<UserRole, Partial<Record<Resource, string[]>>> = {
  intern: {
    tasks: ['view_own', 'update_own'],
    timesheets: ['view_own', 'create_own', 'update_own'],
    outputs: ['view_own'],
    dashboard: ['view_own'],
  },
  supervisor: {
    tasks: ['view_all', 'create', 'update_all', 'review'],
    timesheets: ['view_all', 'approve', 'reject'],
    outputs: ['view_all'],
    dashboard: ['view_own', 'view_team'],
    approvals: ['view', 'approve', 'reject'],
  },
  admin: {
    tasks: ['view_all', 'create', 'update_all', 'review'],
    timesheets: ['view_all', 'approve', 'reject'],
    outputs: ['view_all'],
    dashboard: ['view_own', 'view_team', 'view_all'],
    approvals: ['view', 'approve', 'reject'],
    interns: ['view', 'manage'],
    reports: ['view', 'export'],
  },
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  supervisor: 'Supervisor',
  intern: 'Intern',
};

export const ROUTES = {
  HQ: 'index.html',
  INTERN: 'intern.html',
  LOGIN: 'login.html',
} as const;

export function hasPermission(role: UserRole, resource: Resource, action: string): boolean {
  const perms = PERMISSIONS[role];
  if (!perms?.[resource]) return false;
  return perms[resource]!.includes(action) || perms[resource]!.includes('*');
}

export const isAdmin = (role: UserRole): boolean => role === 'admin';
export const isSupervisor = (role: UserRole): boolean => role === 'supervisor';
export const isIntern = (role: UserRole): boolean => role === 'intern';
export const isStaff = (role: UserRole): boolean => isAdmin(role) || isSupervisor(role);
export const isAtLeast = (role: UserRole, minimum: UserRole): boolean =>
  (ROLE_HIERARCHY[role] ?? 0) >= (ROLE_HIERARCHY[minimum] ?? 0);
