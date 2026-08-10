import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./supabase', () => ({
  sb: {
    auth: { getSession: vi.fn() },
    from: vi.fn(),
  },
}));

vi.mock('@shared/utils/logger.ts', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

vi.mock('@shared/components/toast.ts', () => ({
  showToast: vi.fn(),
}));

import { sb } from './supabase';
import { createUser } from './userService';

const mockSb = sb as unknown as {
  auth: { getSession: ReturnType<typeof vi.fn> };
  from: ReturnType<typeof vi.fn>;
};

const SESSION = { data: { session: { access_token: 'jwt-123' } } };

function mockFetch(status: number, payload: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSb.auth.getSession.mockResolvedValue(SESSION);
});

afterEach(() => vi.unstubAllGlobals());

describe('createUser', () => {
  it('posts the invite to the admin endpoint with the caller token', async () => {
    const fetchMock = mockFetch(200, { id: 'new-1' });

    const result = await createUser({
      name: 'Ja De Ocampo',
      email: 'jade@example.com',
      role: 'intern',
      school: 'UB',
      program: 'BSIT',
      required_hours: 486,
    });

    expect(result.ok).toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/create-user');
    expect(init.method).toBe('POST');
    // The service-role key lives only on the server, so the browser must
    // identify itself with the signed-in user's token.
    expect(init.headers.Authorization).toBe('Bearer jwt-123');
    expect(JSON.parse(init.body)).toMatchObject({
      name: 'Ja De Ocampo',
      email: 'jade@example.com',
      role: 'intern',
      required_hours: 486,
    });
  });

  it('refuses to call the endpoint when there is no session', async () => {
    const fetchMock = mockFetch(200, {});
    mockSb.auth.getSession.mockResolvedValue({ data: { session: null } });

    const result = await createUser({ name: 'A', email: 'a@b.co', role: 'intern' });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/sign in again/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces the server message for a duplicate email', async () => {
    mockFetch(409, { error: 'That email already has an account.' });

    const result = await createUser({ name: 'A', email: 'taken@b.co', role: 'intern' });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('That email already has an account.');
  });

  it('reports a rejection when a non-admin calls it', async () => {
    mockFetch(403, { error: 'Only an admin can add users.' });

    const result = await createUser({ name: 'A', email: 'a@b.co', role: 'intern' });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Only an admin can add users.');
  });

  it('falls back to a readable message when the server sends no error text', async () => {
    mockFetch(500, {});

    const result = await createUser({ name: 'A', email: 'a@b.co', role: 'intern' });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/500/);
  });

  it('does not throw when the network is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const result = await createUser({ name: 'A', email: 'a@b.co', role: 'intern' });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/offline/);
  });
});
