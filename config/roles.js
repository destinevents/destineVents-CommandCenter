const ROLES = {
  ADMIN: 'admin',
  SUPERVISOR: 'supervisor',
  INTERN: 'intern',
};

const ROLE_HIERARCHY = {
  [ROLES.ADMIN]: 3,
  [ROLES.SUPERVISOR]: 2,
  [ROLES.INTERN]: 1,
};

const PERMISSIONS = {
  // Intern can only see/manage own data
  [ROLES.INTERN]: {
    tasks: ['view_own', 'update_own'],
    timesheets: ['view_own', 'create_own', 'update_own'],
    outputs: ['view_own'],
    dashboard: ['view_own'],
  },
  // Supervisor can manage assigned interns
  [ROLES.SUPERVISOR]: {
    tasks: ['view_all', 'create', 'update_all', 'review'],
    timesheets: ['view_all', 'approve', 'reject'],
    outputs: ['view_all'],
    dashboard: ['view_own', 'view_team'],
    approvals: ['view', 'approve', 'reject'],
  },
  // Admin has full access to everything
  [ROLES.ADMIN]: {
    tasks: ['view_all', 'create', 'update_all', 'review'],
    timesheets: ['view_all', 'approve', 'reject'],
    outputs: ['view_all'],
    dashboard: ['view_own', 'view_team', 'view_all'],
    approvals: ['view', 'approve', 'reject'],
    interns: ['view', 'manage'],
    reports: ['view', 'export'],
  },
};

const ROLE_LABELS = {
  [ROLES.ADMIN]: 'Admin',
  [ROLES.SUPERVISOR]: 'Supervisor',
  [ROLES.INTERN]: 'Intern',
};

const ROUTES = {
  HQ: 'index.html',
  INTERN: 'intern.html',
  LOGIN: 'login.html',
};

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  tasks: 'Tasks',
  timesheets: 'Timesheets',
  outputs: 'Output Portfolio',
  approvals: 'Approvals',
  interns: 'Interns',
  reports: 'Reports',
};

function hasPermission(role, resource, action) {
  const perms = PERMISSIONS[role];
  if (!perms || !perms[resource]) return false;
  return perms[resource].includes(action) || perms[resource].includes('*');
}

function isAtLeast(role, minimum) {
  return (ROLE_HIERARCHY[role] || 0) >= (ROLE_HIERARCHY[minimum] || 0);
}

function isAdmin(role) { return role === ROLES.ADMIN; }
function isSupervisor(role) { return role === ROLES.SUPERVISOR; }
function isIntern(role) { return role === ROLES.INTERN; }
function isStaff(role) { return isAdmin(role) || isSupervisor(role); }
