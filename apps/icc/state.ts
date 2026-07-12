// ─── ICC SHARED STATE (leaf module — imports nothing) ────────────────────────
// Every mutable cross-file value lives here. Sibling modules import the live
// bindings for reads; reassignment goes through the set* functions (ES module
// imports are read-only views, but property mutation on objects is allowed —
// realtime updates in app.ts mutate currentUser's fields directly).
import type { InternUser, Task, Timesheet } from '../../shared/types.ts';

export let currentUser: InternUser = {} as InternUser;
export function setCurrentUser(u: InternUser): void { currentUser = u; }

export let activePage: string = 'dashboard';
export function setActivePage(p: string): void { activePage = p; }

export let sheetFilter: string = 'all';
export function setSheetFilterValue(f: string): void { sheetFilter = f; }

export let taskFilter: string = 'all';
export function setTaskFilterValue(f: string): void { taskFilter = f; }

export let liveUsers: InternUser[] = [];
export function setLiveUsers(v: InternUser[]): void { liveUsers = v; }

export let liveTasks: Task[] = [];
export function setLiveTasks(v: Task[]): void { liveTasks = v; }

export let liveTimesheets: Timesheet[] = [];
export function setLiveTimesheets(v: Timesheet[]): void { liveTimesheets = v; }

// ─── STATE ACCESSORS ─────────────────────────────────────────────────────────
export function user(id: string): InternUser {
  return liveUsers.find((u) => u.id === id) || ({} as InternUser);
}

export function myTasks(): Task[] {
  return liveTasks;
}

export function mySheets(): Timesheet[] {
  return liveTimesheets;
}

export function pendingApprovals(): Timesheet[] {
  return liveTimesheets.filter((t) => t.status === 'pending');
}
