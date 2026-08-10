import { sb } from '@shared/core/supabase';
import { logger } from '@shared/utils/logger.ts';
import { FETCH_CAP } from '../tasks/taskService.ts';
import type { Timesheet, TimesheetStats, SkillFrequency, UserRole } from '@shared/types';

export async function fetchTimesheets(role: UserRole, userId: string): Promise<Timesheet[]> {
  const base = sb.from('intern_timesheets').select('*');
  const query = role === 'intern' ? base.eq('intern_id', userId) : base;
  const { data, error } = await query.order('date', { ascending: false }).limit(FETCH_CAP);
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

export async function deleteTimesheet(id: string): Promise<boolean> {
  const { error } = await sb.from('intern_timesheets').delete().eq('id', id);
  if (error) {
    logger.error('deleteTimesheet', error.message, error);
    return false;
  }
  return true;
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

export function getExistingHoursForDate(
  sheets: Timesheet[],
  date: string,
  userId: string,
  excludeId?: string | null
): number {
  return sheetsForDate(sheets, date, userId, excludeId).reduce((s, t) => s + t.hours, 0);
}

// Entries already logged by one intern on one date. `excludeId` leaves out the
// entry currently being edited, so re-saving it never counts its own hours
// twice against the daily cap or trips the duplicate-date warning.
export function sheetsForDate(
  sheets: Timesheet[],
  date: string,
  userId: string,
  excludeId?: string | null
): Timesheet[] {
  return sheets.filter(
    (ts) => ts.date === date && ts.intern_id === userId && ts.id !== excludeId
  );
}

// Approved entries are permanently locked for everyone, admins included
// (spec §4.1). Pending and rejected entries stay editable by the intern who
// owns them, and by supervisors/admins who may need to correct them.
export function canEditTimesheet(
  sheet: Pick<Timesheet, 'status' | 'intern_id'> | null | undefined,
  userId: string,
  role: UserRole
): boolean {
  if (!sheet) return false;
  if (sheet.status !== 'pending' && sheet.status !== 'rejected') return false;
  return role === 'intern' ? sheet.intern_id === userId : true;
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
