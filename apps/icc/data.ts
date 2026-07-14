// @ts-nocheck
// ─── ICC DATA LOADING (imports services + state only) ────────────────────────
import { fetchUsers } from '@shared/services/core/userService.ts';
import { fetchTasks } from './services/taskService.ts';
import { fetchTimesheets } from './services/timesheetService.ts';
import { currentUser, setLiveUsers, setLiveTasks, setLiveTimesheets } from './state.ts';

export async function loadLiveUsers() {
  const result = await fetchUsers();
  if (result) setLiveUsers(result);
}

export async function loadLiveTasks() {
  const result = await fetchTasks(currentUser.role, currentUser.id);
  if (result) setLiveTasks(result);
}

export async function loadLiveTimesheets() {
  const result = await fetchTimesheets(currentUser.role, currentUser.id);
  if (result) setLiveTimesheets(result);
}
