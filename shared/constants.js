// FROZEN classic copy — still loaded by index.html (HQ portal). The canonical
// module version lives beside this file (.ts); delete this one when HQ converts.
const SKILL_LIST = [
  "Web Development","Backend Development","Database Design","Automation",
  "Debugging","Graphic Design","Video Editing","Content Creation",
  "Communication","Problem Solving"
];

const STATUS_LABELS = { assigned:"Assigned", acknowledged:"Acknowledged", in_progress:"In Progress", completed:"Completed", reviewed:"Reviewed", pending:"Pending", approved:"Approved", rejected:"Rejected" };

const STATUS_COLORS = { assigned:"#6366f1", acknowledged:"#f59e0b", in_progress:"#3b82f6", completed:"#10b981", reviewed:"#8b5cf6", pending:"#f59e0b", approved:"#10b981", rejected:"#ef4444" };

const OUTPUT_ICONS  = { code:"💻", design:"🎨", video:"🎬", document:"📄", automation:"⚙️", landing_page:"🌐" };

// Single source for output-type <select>s (filters + task modal) — keep keys
// in sync with OUTPUT_ICONS and the intern_tasks.output_type DB check.
const OUTPUT_TYPES  = { code:"Code", design:"Design", video:"Video", document:"Document", automation:"Automation", landing_page:"Landing Page" };

const KANBAN_COLS   = ["assigned","acknowledged","in_progress","completed","reviewed"];

// Owner-decided caps (July 4 2026): 9h max per day (spec draft said 8, boss
// said 9); per-entry max 10 lives in the intern_timesheets DB check constraint.
// Keep in sync with the validateDailyHours default in utils/validators.{js,ts}.
const MAX_DAILY_HOURS = 9;

// Newest-rows-win safety cap for task/timesheet fetches. Pure guard at this
// team's scale — stats/reports would undercount beyond it, so revisit with
// server-side aggregation if ever hit. Sync: services/taskService.ts.
const FETCH_CAP = 2000;
