import { sb } from './supabase';
import { logger } from '../utils/loggerUtils.ts';
import type { Timesheet, TimesheetStats, SkillFrequency, UserRole } from '../js/shared/types';

export async function fetchTimesheets(role: UserRole, userId: string): Promise<Timesheet[]> {
  const base = sb.from('intern_timesheets').select('*');
  const query = role === 'intern' ? base.eq('intern_id', userId) : base;
  const { data, error } = await query.order('date', { ascending: false });
  if (error) {
    logger.error('fetchTimesheets', error.message, error);
    return [];
  }
  return (data ?? []) as Timesheet[];
}

export async function createTimesheet(data: Partial<Timesheet>): Promise<Timesheet | null> {
  const { data: result, error } = await sb.from('intern_timesheets').insert(data).select();
  if (error) {
    logger.error('createTimesheet', error.message, error);
    return null;
  }
  return (result as Timesheet[] | null)?.[0] ?? null;
}

export async function updateTimesheet(
  id: string,
  data: Partial<Timesheet>
): Promise<Timesheet | null> {
  const { data: result, error } = await sb
    .from('intern_timesheets')
    .update(data)
    .eq('id', id)
    .select();
  if (error) {
    logger.error('updateTimesheet', error.message, error);
    return null;
  }
  return (result as Timesheet[] | null)?.[0] ?? null;
}

export function calcTimesheetStats(sheets: Timesheet[]): TimesheetStats {
  const approved = sheets.filter((t) => t.status === 'approved');
  const pending = sheets.filter((t) => t.status === 'pending');
  return {
    total: sheets.length,
    approvedHours: approved.reduce((s, t) => s + t.hours, 0),
    pendingHours: pending.reduce((s, t) => s + t.hours, 0),
    totalHours: sheets.reduce((s, t) => s + t.hours, 0),
    approvedCount: approved.length,
    pendingCount: pending.length,
  };
}

export function getExistingHoursForDate(sheets: Timesheet[], date: string, userId: string): number {
  return sheets
    .filter((ts) => ts.date === date && ts.intern_id === userId)
    .reduce((s, t) => s + t.hours, 0);
}

export function buildSkillFrequency(sheets: Timesheet[]): SkillFrequency[] {
  const skillMap: Record<string, number> = {};
  sheets
    .filter((t) => t.status === 'approved')
    .forEach((ts) =>
      (ts.skills || []).forEach((s) => {
        skillMap[s] = (skillMap[s] || 0) + 1;
      })
    );
  return Object.entries(skillMap)
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count);
}
