import { sb } from './supabase';
import { logger } from '../utils/loggerUtils.ts';
import type { Task, TaskStatus, TaskStats, TaskAction, UserRole } from '../types';

// Safety cap: newest rows win — keep in sync with taskService.js
export const FETCH_CAP = 2000;

export async function fetchTasks(role: UserRole, userId: string): Promise<Task[]> {
  const base = sb.from('intern_tasks').select('*');
  const query = role === 'intern' ? base.eq('assigned_to', userId) : base;
  const { data, error } = await query.order('created_at', { ascending: false }).limit(FETCH_CAP);
  if (error) {
    logger.error('fetchTasks', error.message, error);
    return [];
  }
  return (data ?? []) as Task[];
}

export async function createTask(data: Partial<Task>): Promise<Task | null> {
  const { data: result, error } = await sb.from('intern_tasks').insert(data).select();
  if (error) {
    logger.error('createTask', error.message, error);
    return null;
  }
  return (result as Task[] | null)?.[0] ?? null;
}

export async function deleteTask(id: string): Promise<boolean> {
  const { error } = await sb.from('intern_tasks').delete().eq('id', id);
  if (error) {
    logger.error('deleteTask', error.message, error);
    return false;
  }
  return true;
}

export async function updateTask(id: string, data: Partial<Task>): Promise<Task | null> {
  const { data: result, error } = await sb.from('intern_tasks').update(data).eq('id', id).select();
  if (error) {
    logger.error('updateTask', error.message, error);
    return null;
  }
  return (result as Task[] | null)?.[0] ?? null;
}

const TASK_STATUS_TRANSITIONS: Record<
  TaskStatus,
  { next: TaskStatus | null; actionLabel: string | null }
> = {
  assigned: { next: 'acknowledged', actionLabel: 'Acknowledge' },
  acknowledged: { next: 'in_progress', actionLabel: 'Start' },
  in_progress: { next: 'completed', actionLabel: 'Mark Complete' },
  completed: { next: 'reviewed', actionLabel: 'Mark Reviewed' },
  reviewed: { next: null, actionLabel: null },
};

export function getNextTaskAction(task: Task | null, role: UserRole): TaskAction | null {
  if (!task) return null;
  const transition = TASK_STATUS_TRANSITIONS[task.status];
  if (!transition?.next) return null;
  if (task.status === 'completed' && role === 'intern') return null;
  if (task.status === 'completed')
    return { action: 'review', label: transition.actionLabel!, style: '#f5f3ff;color:#8b5cf6' };
  if (transition.next === 'acknowledged' && role === 'intern')
    return {
      action: 'acknowledge',
      label: transition.actionLabel!,
      style: '#fffbeb;color:#f59e0b',
    };
  if (transition.next === 'in_progress' && role === 'intern')
    return { action: 'start', label: transition.actionLabel!, style: '#eff6ff;color:#3b82f6' };
  if (transition.next === 'completed' && role === 'intern')
    return { action: 'complete', label: transition.actionLabel!, style: '#ecfdf5;color:#10b981' };
  return null;
}

export function requiresOutputLink(outputType: string | null): boolean {
  return ['code', 'design', 'video', 'landing_page'].includes(outputType ?? '');
}

export function calcTaskStats(tasks: Task[]): TaskStats {
  return {
    total: tasks.length,
    active: tasks.filter((t) => !['completed', 'reviewed'].includes(t.status)).length,
    completed: tasks.filter((t) => ['completed', 'reviewed'].includes(t.status)).length,
    byStatus: Object.fromEntries(
      (['assigned', 'acknowledged', 'in_progress', 'completed', 'reviewed'] as TaskStatus[]).map(
        (s) => [s, tasks.filter((t) => t.status === s).length]
      )
    ) as Record<TaskStatus, number>,
  };
}
