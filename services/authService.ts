import { sb } from './supabase';
import { logger } from '../utils/loggerUtils.ts';
import type { InternUser } from '../js/shared/types';

interface AuthMeta {
  name?: string;
  school?: string | null;
  program?: string | null;
  [key: string]: unknown;
}

interface ProfileUpdates {
  name: string;
  school: string | null;
  program: string | null;
}

interface AuthResult {
  error: { message: string } | null;
}

export async function signUp(email: string, password: string, meta: AuthMeta = {}) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { role: _role, ...safeMeta } = meta as AuthMeta & { role?: unknown };
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: safeMeta } });
    if (error) return { data: null, error };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function signIn(email: string, password: string) {
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { data: null, error };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function signOut(): Promise<void> {
  const { error } = await sb.auth.signOut();
  if (error) logger.error('authService.signOut', error.message, error);
}

export async function getSession() {
  try {
    const {
      data: { session },
    } = await sb.auth.getSession();
    return session;
  } catch (err) {
    logger.error('authService.getSession', (err as Error).message, err);
    return null;
  }
}

export async function getProfile(userId: string): Promise<InternUser | null> {
  const { data, error } = await sb.from('intern_users').select('*').eq('id', userId).single();
  if (error) {
    logger.warn('authService.getProfile', error.message);
    return null;
  }
  return data as InternUser;
}

export async function getCurrentUser(): Promise<InternUser | null> {
  const session = await getSession();
  if (!session?.user) return null;
  const profile = await getProfile(session.user.id);
  return {
    ...session.user,
    ...(profile || {}),
    id: session.user.id,
    name: profile?.name || session.user.user_metadata?.name || null,
    role: profile?.role || 'intern',
  } as InternUser;
}

export async function getAuthUser() {
  try {
    const {
      data: { user },
    } = await sb.auth.getUser();
    return user;
  } catch (err) {
    logger.error('authService.getAuthUser', (err as Error).message, err);
    return null;
  }
}

export async function updateProfile(userId: string, updates: ProfileUpdates): Promise<AuthResult> {
  try {
    const { error: dbErr } = await sb.from('intern_users').update(updates).eq('id', userId);
    if (dbErr) return { error: dbErr };
    const { error: metaErr } = await sb.auth.updateUser({ data: updates });
    if (metaErr) return { error: metaErr };
    return { error: null };
  } catch (err) {
    return { error: err as { message: string } };
  }
}

export async function updatePassword(
  email: string,
  currentPassword: string,
  newPassword: string
): Promise<AuthResult> {
  if (!email) return { error: { message: 'Session expired. Please sign in again.' } };
  try {
    const { error: authErr } = await sb.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (authErr) return { error: { message: 'Current password is incorrect.' } };
    const { error: updateErr } = await sb.auth.updateUser({ password: newPassword });
    if (updateErr) return { error: updateErr };
    return { error: null };
  } catch (err) {
    logger.error('authService.updatePassword', (err as Error).message, err);
    return { error: err as { message: string } };
  }
}
