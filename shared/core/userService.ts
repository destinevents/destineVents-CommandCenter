import { sb } from './supabase';
import { logger } from '@shared/utils/logger.ts';
import { showToast } from '@shared/components/toast.ts';
import type { InternUser, UserRole } from '@shared/types';

export async function fetchUsers(): Promise<InternUser[]> {
  const { data, error } = await sb
    .from('intern_users')
    .select('*')
    .neq('role', 'pending')
    .order('created_at', { ascending: false });
  if (error) {
    logger.error('fetchUsers', error.message, error);
    showToast(`Something went wrong: ${error.message || 'Unknown error'}. Try refreshing.`);
    return [];
  }
  return (data as InternUser[]) || [];
}

export async function fetchPendingUsers(): Promise<InternUser[]> {
  const { data, error } = await sb
    .from('intern_users')
    .select('*')
    .eq('role', 'pending')
    .order('created_at', { ascending: true });
  if (error) {
    logger.error('fetchPendingUsers', error.message, error);
    return [];
  }
  return (data as InternUser[]) || [];
}

export async function fetchAllUsers(): Promise<InternUser[]> {
  const { data, error } = await sb
    .from('intern_users')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    logger.error('fetchAllUsers', error.message, error);
    return [];
  }
  return (data as InternUser[]) || [];
}

export interface NewUserInput {
  name: string;
  email: string;
  role: UserRole;
  school?: string;
  program?: string;
  required_hours?: number | null;
}

export interface CreateUserResult {
  ok: boolean;
  error?: string;
}

/**
 * Invites a new person and assigns their role in one step.
 *
 * Goes through /api/admin/create-user rather than the browser Supabase client:
 * creating an auth account needs the service-role key, which can only live on
 * the server. The invited person sets their own password from the emailed link.
 *
 * Because both portals read the same intern_users table, anyone added here
 * appears in the HQ Users list straight away — no separate step.
 */
export async function createUser(input: NewUserInput): Promise<CreateUserResult> {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return { ok: false, error: 'Your session has expired. Please sign in again.' };

    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(input),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = payload?.error || `Could not add the user (error ${res.status}).`;
      logger.error('createUser', message, payload);
      return { ok: false, error: message };
    }
    return { ok: true };
  } catch (err) {
    const message = (err as Error).message || 'Unknown error';
    logger.error('createUser', message, err);
    return { ok: false, error: `Could not reach the server: ${message}` };
  }
}

export async function updateUserRole(id: string, role: UserRole): Promise<boolean> {
  const { error } = await sb
    .from('intern_users')
    .update({ role })
    .eq('id', id);
  if (error) {
    logger.error('updateUserRole', error.message, error);
    return false;
  }
  return true;
}
