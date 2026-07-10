import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./supabase', () => ({
  sb: { from: vi.fn() },
}));

import { sb } from './supabase';
import {
  fetchTimesheets,
  createTimesheet,
  updateTimesheet,
  calcTimesheetStats,
  getExistingHoursForDate,
  buildSkillFrequency,
} from './timesheetService.ts';
import type { Timesheet } from '../js/shared/types';

const mockFrom = sb.from as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

const makeSheet = (overrides: Partial<Timesheet> = {}): Timesheet => ({
  id: 's1',
  intern_id: 'u1',
  date: '2025-06-01',
  hours: 4,
  description: 'Worked on feature',
  skills: ['TypeScript'],
  status: 'pending',
  created_at: '2025-06-01',
  ...overrides,
});

describe('fetchTimesheets', () => {
  it('returns all timesheets for admin without filtering', async () => {
    const sheets = [makeSheet(), makeSheet({ intern_id: 'u2' })];
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: sheets, error: null }),
    };
    mockFrom.mockReturnValue(chain);
    const result = await fetchTimesheets('admin', 'u1');
    expect(result).toEqual(sheets);
    expect(chain.select).toHaveBeenCalledWith('*');
  });

  it('applies eq filter for intern role', async () => {
    const sheets = [makeSheet()];
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: sheets, error: null }),
    };
    mockFrom.mockReturnValue(chain);
    const result = await fetchTimesheets('intern', 'u1');
    expect(chain.eq).toHaveBeenCalledWith('intern_id', 'u1');
    expect(result).toEqual(sheets);
  });

  it('returns empty array on error', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
    };
    mockFrom.mockReturnValue(chain);
    const result = await fetchTimesheets('intern', 'u1');
    expect(result).toEqual([]);
  });
});

describe('createTimesheet', () => {
  it('returns created sheet on success', async () => {
    const sheet = makeSheet();
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [sheet], error: null }),
    };
    mockFrom.mockReturnValue(chain);
    const result = await createTimesheet({
      intern_id: 'u1',
      date: '2025-06-01',
      hours: 4,
      description: 'x',
      skills: [],
    });
    expect(result).toEqual(sheet);
  });

  it('returns null on Supabase error', async () => {
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: null, error: { message: 'db error' } }),
    };
    mockFrom.mockReturnValue(chain);
    const result = await createTimesheet({ intern_id: 'u1', hours: 4 });
    expect(result).toBeNull();
  });
});

describe('updateTimesheet', () => {
  it('returns updated sheet on success', async () => {
    const sheet = makeSheet({ status: 'approved' });
    const chain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [sheet], error: null }),
    };
    mockFrom.mockReturnValue(chain);
    const result = await updateTimesheet('s1', { status: 'approved' });
    expect(result).toEqual(sheet);
    expect(chain.eq).toHaveBeenCalledWith('id', 's1');
  });

  it('returns null on Supabase error', async () => {
    const chain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
    };
    mockFrom.mockReturnValue(chain);
    const result = await updateTimesheet('s1', { status: 'approved' });
    expect(result).toBeNull();
  });
});

describe('calcTimesheetStats', () => {
  it('sums approved and pending hours correctly', () => {
    const sheets = [
      makeSheet({ hours: 4, status: 'approved' }),
      makeSheet({ hours: 3, status: 'approved' }),
      makeSheet({ hours: 2, status: 'pending' }),
    ];
    const stats = calcTimesheetStats(sheets);
    expect(stats.approvedHours).toBe(7);
    expect(stats.pendingHours).toBe(2);
    expect(stats.totalHours).toBe(9);
    expect(stats.approvedCount).toBe(2);
    expect(stats.pendingCount).toBe(1);
  });
});

describe('getExistingHoursForDate', () => {
  it('sums hours for a specific date and user only', () => {
    const sheets = [
      makeSheet({ date: '2025-06-01', hours: 3, intern_id: 'u1' }),
      makeSheet({ date: '2025-06-01', hours: 2, intern_id: 'u1' }),
      makeSheet({ date: '2025-06-02', hours: 5, intern_id: 'u1' }),
      makeSheet({ date: '2025-06-01', hours: 8, intern_id: 'u2' }),
    ];
    expect(getExistingHoursForDate(sheets, '2025-06-01', 'u1')).toBe(5);
  });
});

describe('buildSkillFrequency', () => {
  it('counts skills from approved sheets only, sorted descending', () => {
    const sheets = [
      makeSheet({ status: 'approved', skills: ['TypeScript', 'React'] }),
      makeSheet({ status: 'approved', skills: ['TypeScript'] }),
      makeSheet({ status: 'pending', skills: ['Python'] }),
    ];
    const freq = buildSkillFrequency(sheets);
    expect(freq[0]).toEqual({ skill: 'TypeScript', count: 2 });
    expect(freq.find((f) => f.skill === 'Python')).toBeUndefined();
  });
});
