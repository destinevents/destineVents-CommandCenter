// ─── ICC SHARED STATE (leaf module — imports nothing) ────────────────────────
// Every mutable cross-file value lives here. Sibling modules import the live
// bindings for reads; reassignment goes through the set* functions (ES module
// imports are read-only views, but property mutation on objects is allowed —
// realtime updates in app.js mutate currentUser's fields directly).

export let currentUser = {};
export function setCurrentUser(u) { currentUser = u; }

export let activePage = 'dashboard';
export function setActivePage(p) { activePage = p; }

export let sheetFilter = 'all';
export function setSheetFilterValue(f) { sheetFilter = f; }

export let taskFilter = 'all';
export function setTaskFilterValue(f) { taskFilter = f; }

export let liveUsers = [];
export function setLiveUsers(v) { liveUsers = v; }

export let liveTasks = [];
export function setLiveTasks(v) { liveTasks = v; }

export let liveTimesheets = [];
export function setLiveTimesheets(v) { liveTimesheets = v; }

// ─── STATE ACCESSORS ─────────────────────────────────────────────────────────
export function user(id) {
  return liveUsers.find((u) => u.id === id) || {};
}

export function myTasks() {
  return liveTasks;
}

export function mySheets() {
  return liveTimesheets;
}

export function pendingApprovals() {
  return liveTimesheets.filter((t) => t.status === 'pending');
}
