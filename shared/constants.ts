// ESM version of shared/constants.js (frozen classic copy kept for the HQ
// portal until it converts). Keep the two in sync until then.

export const SKILL_LIST = [
  "Web Development","Backend Development","Database Design","Automation",
  "Debugging","Graphic Design","Video Editing","Content Creation",
  "Communication","Problem Solving"
];

export const STATUS_LABELS: Record<string, string> = { assigned:"Assigned", acknowledged:"Acknowledged", in_progress:"In Progress", on_hold:"On Hold", completed:"Completed", reviewed:"Reviewed", pending:"Pending", approved:"Approved", rejected:"Rejected" };

export const STATUS_COLORS: Record<string, string> = { assigned:"#6366f1", acknowledged:"#f59e0b", in_progress:"#3b82f6", on_hold:"#f97316", completed:"#10b981", reviewed:"#8b5cf6", pending:"#f59e0b", approved:"#10b981", rejected:"#ef4444" };

export const OUTPUT_ICONS: Record<string, string> = { code:"💻", design:"🎨", video:"🎬", document:"📄", automation:"⚙️", landing_page:"🌐" };

// Single source for output-type <select>s (filters + task modal) — keep keys
// in sync with OUTPUT_ICONS and the intern_tasks.output_type DB check.
export const OUTPUT_TYPES: Record<string, string> = { code:"Code", design:"Design", video:"Video", document:"Document", automation:"Automation", landing_page:"Landing Page" };

export const KANBAN_COLS = ["assigned","acknowledged","in_progress","on_hold","completed","reviewed"];

// Owner-decided caps (July 4 2026): 9h max per day (spec draft said 8, boss
// said 9); per-entry max 10 lives in the intern_timesheets DB check constraint.
export const MAX_DAILY_HOURS = 9;

// Newest-rows-win safety cap for task/timesheet fetches.
export const FETCH_CAP = 2000;
