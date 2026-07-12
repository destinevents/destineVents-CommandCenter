import type { UserRole } from '../shared/types';

export const ROLES = {
  ADMIN:               'admin',
  SUPERVISOR:          'supervisor',
  INTERN:              'intern',
  PENDING:             'pending',
  FINANCE_OFFICER:     'finance_officer',
  EXTERNAL_ACCOUNTANT: 'external_accountant',
  TEAM_STAFF:          'team_staff',
} as const;

// Roles that belong to the HQ portal
export const HQ_ROLES: UserRole[] = ['admin', 'finance_officer', 'external_accountant', 'team_staff'];

// Roles that belong to the ICC (Intern Command Center) portal
export const ICC_ROLES: UserRole[] = ['supervisor', 'intern'];

// Human-readable labels for every role (used in admin UI dropdowns)
export const ROLE_LABELS: Record<UserRole, string> = {
  admin:               'Admin (Jenn)',
  supervisor:          'Supervisor',
  intern:              'Intern',
  pending:             'Pending',
  finance_officer:     'Finance Officer / Bookkeeper',
  external_accountant: 'External Accountant',
  team_staff:          'Team / Staff',
};

// HQ nav pages each role can access (admin sees everything)
export const HQ_ALLOWED_PAGES: Partial<Record<UserRole, string[]>> = {
  finance_officer:     ['dashboard', 'finance', 'projects', 'clients'],
  external_accountant: ['finance'],
  team_staff:          ['projects', 'clients', 'documents'],
};

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin:               5,
  supervisor:          3,
  intern:              1,
  finance_officer:     4,
  external_accountant: 2,
  team_staff:          2,
  pending:             0,
};

type Resource =
  'tasks' | 'timesheets' | 'outputs' | 'dashboard' | 'approvals' | 'interns' | 'reports';

export const PERMISSIONS: Record<UserRole, Partial<Record<Resource, string[]>>> = {
  intern: {
    tasks:      ['view_own', 'update_own'],
    timesheets: ['view_own', 'create_own', 'update_own'],
    outputs:    ['view_own'],
    dashboard:  ['view_own'],
  },
  supervisor: {
    tasks:      ['view_all', 'create', 'update_all', 'review'],
    timesheets: ['view_all', 'approve', 'reject'],
    outputs:    ['view_all'],
    dashboard:  ['view_own', 'view_team'],
    approvals:  ['view', 'approve', 'reject'],
  },
  admin: {
    tasks:      ['view_all', 'create', 'update_all', 'review'],
    timesheets: ['view_all', 'approve', 'reject'],
    outputs:    ['view_all'],
    dashboard:  ['view_own', 'view_team', 'view_all'],
    approvals:  ['view', 'approve', 'reject'],
    interns:    ['view', 'manage'],
    reports:    ['view', 'export'],
  },
  // HQ roles have no ICC permissions
  pending:             {},
  finance_officer:     {},
  external_accountant: {},
  team_staff:          {},
};

export const ROUTES = {
  HQ:    'index.html',
  INTERN: 'intern.html',
  LOGIN:  'login.html',
} as const;

export function hasPermission(role: UserRole, resource: Resource, action: string): boolean {
  const perms = PERMISSIONS[role];
  if (!perms?.[resource]) return false;
  return perms[resource]!.includes(action) || perms[resource]!.includes('*');
}

export const isAdmin      = (role: UserRole): boolean => role === 'admin';
export const isSupervisor = (role: UserRole): boolean => role === 'supervisor';
export const isIntern     = (role: UserRole): boolean => role === 'intern';
export const isPending    = (role: UserRole): boolean => role === 'pending';
export const isHQRole     = (role: UserRole): boolean => HQ_ROLES.includes(role);
export const isICCRole    = (role: UserRole): boolean => ICC_ROLES.includes(role);
export const isStaff      = (role: UserRole): boolean => isAdmin(role) || isSupervisor(role);
export const isAtLeast    = (role: UserRole, minimum: UserRole): boolean =>
  (ROLE_HIERARCHY[role] ?? 0) >= (ROLE_HIERARCHY[minimum] ?? 0);
