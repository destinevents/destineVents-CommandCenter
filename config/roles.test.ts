import { describe, it, expect } from 'vitest';
import {
  ROLES, HQ_ROLES, ICC_ROLES, ROLE_LABELS, ROLE_HIERARCHY,
  HQ_ALLOWED_PAGES, PERMISSIONS, isHQRole, isICCRole, hasPermission,
} from './roles';
import type { UserRole } from '../shared/types';

const ALL_ROLES = Object.values(ROLES) as UserRole[];

describe('role tables stay in sync', () => {
  // A role missing from any one of these maps fails silently at runtime —
  // a blank dropdown label, an undefined rank, an unguarded page.
  it.each(ALL_ROLES)('%s has a label', (role) => {
    expect(ROLE_LABELS[role]).toBeTruthy();
  });

  it.each(ALL_ROLES)('%s has a hierarchy rank', (role) => {
    expect(typeof ROLE_HIERARCHY[role]).toBe('number');
  });

  it.each(ALL_ROLES)('%s has a permissions entry', (role) => {
    expect(PERMISSIONS[role]).toBeDefined();
  });

  it('assigns every non-pending role to exactly one portal', () => {
    ALL_ROLES.filter((r) => r !== 'pending').forEach((role) => {
      expect(
        isHQRole(role) !== isICCRole(role),
        `${role} must belong to exactly one portal`,
      ).toBe(true);
    });
  });

  it('leaves pending outside both portals', () => {
    expect(isHQRole('pending')).toBe(false);
    expect(isICCRole('pending')).toBe(false);
  });
});

describe('freelancer', () => {
  it('is an HQ role, not an ICC one', () => {
    expect(HQ_ROLES).toContain('freelancer');
    expect(ICC_ROLES).not.toContain('freelancer');
  });

  it('reads as "Freelancer" in dropdowns', () => {
    expect(ROLE_LABELS.freelancer).toBe('Freelancer');
  });

  it('sees projects and documents but no finance or client list', () => {
    const pages = HQ_ALLOWED_PAGES.freelancer ?? [];
    expect(pages).toEqual(expect.arrayContaining(['projects', 'documents']));
    expect(pages).not.toContain('finance');
    expect(pages).not.toContain('clients');
  });

  it('has no intern-portal permissions', () => {
    expect(hasPermission('freelancer', 'timesheets', 'approve')).toBe(false);
    expect(hasPermission('freelancer', 'interns', 'manage')).toBe(false);
    expect(hasPermission('freelancer', 'tasks', 'view_all')).toBe(false);
  });

  it('ranks below admin', () => {
    expect(ROLE_HIERARCHY.freelancer).toBeLessThan(ROLE_HIERARCHY.admin);
  });
});
