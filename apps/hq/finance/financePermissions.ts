// Finance permission tiers (§9). Maps the app's user roles onto the handout's
// access model:
//   Administrator      -> full access                (admin)
//   Finance            -> create/edit/delete records (finance_officer)
//   Management         -> view reports & dashboards  (supervisor)
//   External Accountant-> view reports (read-only)   (external_accountant)
//   Project Managers   -> view project summaries     (team_staff)
//   Employees          -> no access                  (intern / pending)
import type { UserRole } from '@shared/types.ts';
import { _userRole } from '@hq/core/state.ts';

const MANAGE_ROLES: ReadonlyArray<UserRole> = ['admin', 'finance_officer'];
const VIEW_ROLES: ReadonlyArray<UserRole> = ['admin', 'finance_officer', 'supervisor', 'external_accountant'];
const PROJECT_VIEW_ROLES: ReadonlyArray<UserRole> = [...VIEW_ROLES, 'team_staff'];

// May create / edit / delete financial records.
export function canManageFinance(role: UserRole = _userRole): boolean {
  return MANAGE_ROLES.includes(role);
}

// May view finance dashboards and reports.
export function canViewFinance(role: UserRole = _userRole): boolean {
  return VIEW_ROLES.includes(role);
}

// May view project financial summaries (PMs, plus anyone who can view finance).
export function canViewProjectFinance(role: UserRole = _userRole): boolean {
  return PROJECT_VIEW_ROLES.includes(role);
}
