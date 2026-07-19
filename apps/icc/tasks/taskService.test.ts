import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@shared/core/supabase', () => ({
  sb: { from: vi.fn() },
}));

import { sb } from '@shared/core/supabase';
import {
  fetchTasks,
  createTask,
  updateTask,
  getNextTaskAction,
  requiresOutputLink,
  calcTaskStats,
} from './taskService.ts';
import type { Task } from '@shared/types';

const mockFrom = sb.from as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 't1',
  title: 'Test task',
  description: null,
  status: 'assigned',
  assigned_to: 'u1',
  created_by: 'admin1',
  output_type: null,
  output_link: null,
  created_at: '2025-01-01',
  ...overrides,
});

describe('fetchTasks', () => {
  it('returns tasks for admin (no filter)', async () => {
    const tasks = [makeTask()];
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: tasks, error: null }),
    };
    mockFrom.mockReturnValue(chain);
    const result = await fetchTasks('admin', 'u1');
    expect(result).toEqual(tasks);
  });

  it('returns empty array on error', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
    };
    mockFrom.mockReturnValue(chain);
    const result = await fetchTasks('admin', 'u1');
    expect(result).toEqual([]);
  });
});

describe('createTask', () => {
  it('returns created task on success', async () => {
    const task = makeTask({ title: 'New task' });
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [task], error: null }),
    };
    mockFrom.mockReturnValue(chain);
    const result = await createTask({ title: 'New task', created_by: 'admin1' });
    expect(result).toEqual(task);
  });

  it('returns null on error', async () => {
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
    };
    mockFrom.mockReturnValue(chain);
    const result = await createTask({ title: 'x' });
    expect(result).toBeNull();
  });
});

describe('updateTask', () => {
  it('returns updated task on success', async () => {
    const task = makeTask({ status: 'acknowledged' });
    const chain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [task], error: null }),
    };
    mockFrom.mockReturnValue(chain);
    const result = await updateTask('t1', { status: 'acknowledged' });
    expect(result?.status).toBe('acknowledged');
  });
});

describe('getNextTaskAction', () => {
  it('returns null when task is null', () => expect(getNextTaskAction(null, 'intern')).toBeNull());
  it('returns null for reviewed tasks', () =>
    expect(getNextTaskAction(makeTask({ status: 'reviewed' }), 'admin')).toBeNull());
  it('returns acknowledge action for assigned intern', () => {
    const action = getNextTaskAction(makeTask({ status: 'assigned' }), 'intern');
    expect(action?.action).toBe('acknowledge');
  });
  it('returns null for completed task when role is intern', () =>
    expect(getNextTaskAction(makeTask({ status: 'completed' }), 'intern')).toBeNull());
  it('returns review action for completed task when role is admin', () => {
    const action = getNextTaskAction(makeTask({ status: 'completed' }), 'admin');
    expect(action?.action).toBe('review');
  });
});

describe('requiresOutputLink', () => {
  it('returns true for code', () => expect(requiresOutputLink('code')).toBe(true));
  it('returns true for design', () => expect(requiresOutputLink('design')).toBe(true));
  it('returns false for unknown type', () => expect(requiresOutputLink('other')).toBe(false));
  it('returns false for null', () => expect(requiresOutputLink(null)).toBe(false));
});

describe('calcTaskStats', () => {
  it('calculates correct totals', () => {
    const tasks = [
      makeTask({ status: 'assigned' }),
      makeTask({ status: 'completed' }),
      makeTask({ status: 'reviewed' }),
    ];
    const stats = calcTaskStats(tasks);
    expect(stats.total).toBe(3);
    expect(stats.active).toBe(1);
    expect(stats.completed).toBe(2);
  });
});
