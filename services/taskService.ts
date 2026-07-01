import { sb } from './supabase';
import type { Task, TaskStatus, TaskStats, TaskAction, UserRole } from '../js/shared/types';

const logger = {
  error: (ctx: string, msg: string, err?: unknown) => console.error(`[${ctx}]`, msg, err),
};

export async function fetchTasks(role: UserRole, userId: string): Promise<Task[]> {
  let query = sb.from('intern_tasks').select('*').order('created_at', { ascending: false });
  if (role === 'intern') query = (query as any).eq('assigned_to', userId);
  const { data, error } = await query;
  if (error) { logger.error('fetchTasks', error.message, error); return []; }
  return (data ?? []) as Task[];
}

export async function createTask(data: Partial<Task>): Promise<Task | null> {
  const { data: result, error } = await sb.from('intern_tasks').insert(data).select();
  if (error) { logger.error('createTask', error.message, error); return null; }
  return ((result as Task[] | null)?.[0]) ?? null;
}

export async function updateTask(id: string, data: Partial<Task>): Promise<Task | null> {
  const { data: result, error } = await sb.from('intern_tasks').update(data).eq('id', id).select();
  if (error) { logger.error('updateTask', error.message, error); return null; }
  return ((result as Task[] | null)?.[0]) ?? null;
}

const TASK_STATUS_TRANSITIONS: Record<TaskStatus, { next: TaskStatus | null; actionLabel: string | null }> = {
  assigned:     { next: 'acknowledged', actionLabel: 'Acknowledge' },
  acknowledged: { next: 'in_progress',  actionLabel: 'Start' },
  in_progress:  { next: 'completed',    actionLabel: 'Mark Complete' },
  completed:    { next: 'reviewed',     actionLabel: 'Mark Reviewed' },
  reviewed:     { next: null,           actionLabel: null },
};

export function getNextTaskAction(task: Task | null, role: UserRole): TaskAction | null {
  if (!task) return null;
  const transition = TASK_STATUS_TRANSITIONS[task.status];
  if (!transition?.next) return null;
  if (task.status === 'completed' && role === 'intern') return null;
  if (task.status === 'completed') return { action: 'review', label: transition.actionLabel!, style: '#f5f3ff;color:#8b5cf6' };
  if (transition.next === 'acknowledged' && role === 'intern') return { action: 'acknowledge', label: transition.actionLabel!, style: '#fffbeb;color:#f59e0b' };
  if (transition.next === 'in_progress'  && role === 'intern') return { action: 'start',       label: transition.actionLabel!, style: '#eff6ff;color:#3b82f6' };
  if (transition.next === 'completed'    && role === 'intern') return { action: 'complete',     label: transition.actionLabel!, style: '#ecfdf5;color:#10b981' };
  return null;
}

export function requiresOutputLink(outputType: string | null): boolean {
  return ['code', 'design', 'video', 'landing_page'].includes(outputType ?? '');
}

export function calcTaskStats(tasks: Task[]): TaskStats {
  return {
    total:     tasks.length,
    active:    tasks.filter(t => !['completed', 'reviewed'].includes(t.status)).length,
    completed: tasks.filter(t =>  ['completed', 'reviewed'].includes(t.status)).length,
    byStatus:  Object.fromEntries(
      (['assigned', 'acknowledged', 'in_progress', 'completed', 'reviewed'] as TaskStatus[]).map(s => [
        s, tasks.filter(t => t.status === s).length,
      ])
    ) as Record<TaskStatus, number>,
  };
}
