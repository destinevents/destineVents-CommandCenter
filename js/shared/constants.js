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
