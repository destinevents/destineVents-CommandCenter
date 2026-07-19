import { vi } from 'vitest';

vi.mock('@shared/core/supabase', () => ({
  sb: {
    from:    () => ({ select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), eq: vi.fn(), single: vi.fn() }),
    auth:    { signIn: vi.fn(), signOut: vi.fn(), getSession: vi.fn() },
    storage: { from: vi.fn() },
  },
}));
