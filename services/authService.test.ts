import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./supabase', () => ({
  sb: {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
      refreshSession: vi.fn(),
      getUser: vi.fn(),
      updateUser: vi.fn(),
    },
    from: vi.fn(),
  },
}));

vi.mock('../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

import { sb } from './supabase';
import {
  signIn,
  signOut,
  getProfile,
  getCurrentUser,
  updateProfile,
  updatePassword,
} from './authService';

const mockSb = sb as unknown as {
  auth: Record<string, ReturnType<typeof vi.fn>>;
  from: ReturnType<typeof vi.fn>;
};

beforeEach(() => vi.clearAllMocks());

describe('signIn', () => {
  it('returns data on success', async () => {
    const fakeSession = { user: { id: 'u1' } };
    mockSb.auth.signInWithPassword.mockResolvedValue({ data: fakeSession, error: null });
    const result = await signIn('test@example.com', 'password123');
    expect(result.data).toEqual(fakeSession);
    expect(result.error).toBeNull();
  });

  it('returns error on failure', async () => {
    const fakeError = { message: 'Invalid credentials' };
    mockSb.auth.signInWithPassword.mockResolvedValue({ data: null, error: fakeError });
    const result = await signIn('test@example.com', 'wrong');
    expect(result.data).toBeNull();
    expect(result.error).toEqual(fakeError);
  });
});

describe('signOut', () => {
  it('calls sb.auth.signOut', async () => {
    mockSb.auth.signOut.mockResolvedValue({ error: null });
    await signOut();
    expect(mockSb.auth.signOut).toHaveBeenCalledOnce();
  });
});

describe('getProfile', () => {
  it('returns profile on success', async () => {
    const fakeProfile = { id: 'u1', name: 'Alice', email: 'a@b.com', role: 'intern' };
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: fakeProfile, error: null }),
    };
    mockSb.from.mockReturnValue(chain);
    const result = await getProfile('u1');
    expect(result).toEqual(fakeProfile);
  });

  it('returns null on error', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
    };
    mockSb.from.mockReturnValue(chain);
    const result = await getProfile('u1');
    expect(result).toBeNull();
  });
});

describe('getCurrentUser', () => {
  it('returns null when no session', async () => {
    mockSb.auth.getSession.mockResolvedValue({ data: { session: null } });
    const result = await getCurrentUser();
    expect(result).toBeNull();
  });

  it('returns merged user+profile when session exists', async () => {
    mockSb.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'u1', user_metadata: {} } } },
    });
    const fakeProfile = {
      id: 'u1',
      name: 'Bob',
      email: 'b@b.com',
      role: 'intern',
      avatar: 'BO',
      school: null,
      program: null,
      created_at: '2025-01-01',
    };
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: fakeProfile, error: null }),
    };
    mockSb.from.mockReturnValue(chain);
    const result = await getCurrentUser();
    expect(result?.name).toBe('Bob');
    expect(result?.role).toBe('intern');
  });

  it('uses profile.role from the database, ignoring a higher role set in user_metadata', async () => {
    mockSb.auth.getSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'u1', user_metadata: { role: 'admin' } }, // attacker-set claim
        },
      },
    });
    const fakeProfile = {
      id: 'u1',
      name: 'Eve',
      email: 'e@e.com',
      role: 'intern', // what the database actually says
      avatar: null,
      school: null,
      program: null,
      created_at: '2025-01-01',
    };
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: fakeProfile, error: null }),
    };
    mockSb.from.mockReturnValue(chain);
    const result = await getCurrentUser();
    expect(result?.role).toBe('intern'); // must NOT be 'admin'
  });
});

describe('updateProfile', () => {
  it('returns null error on full success', async () => {
    const chain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    mockSb.from.mockReturnValue(chain);
    mockSb.auth.updateUser.mockResolvedValue({ error: null });
    const result = await updateProfile('u1', { name: 'New Name', school: 'BSU', program: 'IT' });
    expect(result.error).toBeNull();
  });

  it('returns error when DB update fails', async () => {
    const dbError = { message: 'DB error' };
    const chain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: dbError }),
    };
    mockSb.from.mockReturnValue(chain);
    const result = await updateProfile('u1', { name: 'x', school: null, program: null });
    expect(result.error).toEqual(dbError);
  });

  it('returns error when auth metadata update fails but DB succeeded', async () => {
    const metaError = { message: 'Meta error' };
    const chain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    mockSb.from.mockReturnValue(chain);
    mockSb.auth.updateUser.mockResolvedValue({ error: metaError });
    const result = await updateProfile('u1', { name: 'x', school: null, program: null });
    expect(result.error).toEqual(metaError);
  });
});

describe('updatePassword', () => {
  it('returns session-expired error when email is empty', async () => {
    const result = await updatePassword('', 'old', 'new');
    expect(result.error?.message).toContain('Session expired');
  });

  it('returns incorrect-password error when re-auth fails', async () => {
    mockSb.auth.signInWithPassword.mockResolvedValue({ error: { message: 'wrong' } });
    const result = await updatePassword('a@b.com', 'wrong', 'new');
    expect(result.error?.message).toContain('incorrect');
  });

  it('returns null error on full success', async () => {
    mockSb.auth.signInWithPassword.mockResolvedValue({ error: null });
    mockSb.auth.updateUser.mockResolvedValue({ error: null });
    const result = await updatePassword('a@b.com', 'old', 'NewPass1!');
    expect(result.error).toBeNull();
  });
});
