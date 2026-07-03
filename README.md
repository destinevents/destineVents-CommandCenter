# DestineVents Command Center

A dual-portal operations management platform for **DestineVents Collective OPC**, a Baguio City-based event management and community development company. The platform manages the full business pipeline — CRM, proposals, finance, document vault, partner network — alongside an intern management subsystem for task assignment, timesheets, approvals, and reporting.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Vanilla HTML5, CSS3, JavaScript (ES6+) + TypeScript (services/utils) |
| **Backend** | Supabase (PostgreSQL, Auth, Realtime, Storage) |
| **Bundler** | Vite (dev server + production build) |
| **Testing** | Vitest (130 unit tests across services, utils, config) |
| **Deployment** | Vercel (`npm run build` → `dist/`) |
| **Fonts** | Google Fonts (DM Sans, Cormorant Garamond, Dancing Script) |

### Principles

- No UI framework (no React, Vue, Angular)
- Incremental TypeScript migration — services and utils are `.ts`, page modules are `.js`
- All business logic in JS/TS modules
- Event delegation for UI interactions

---

## Project Structure

```
destineVents-CommandCenter/
├── config/                    # App configuration
│   ├── config.js             # Supabase credentials — NOT in git (gitignored)
│   ├── config.example.js     # Template showing required credential format
│   ├── roles.ts              # Role hierarchy, permissions, routes (TypeScript)
│   └── settings.js           # App constants (brands, rates, statuses)
│
├── services/                  # Domain service layer (Supabase queries)
│   ├── supabase.ts           # Supabase client singleton (reads from import.meta.env)
│   ├── authService.ts        # signIn, signOut, getSession, getCurrentUser
│   ├── taskService.ts        # Tasks CRUD + status transitions
│   ├── timesheetService.ts   # Timesheets CRUD + stats
│   ├── clientService.js      # Clients CRUD (HQ)
│   ├── proposalService.js    # Proposals CRUD + win rate calc (HQ)
│   ├── partnerService.js     # Partners CRUD + filtering (HQ)
│   ├── financeService.js     # Invoices, bills, payroll CRUD + summaries (HQ)
│   ├── documentService.js    # Document upload, metadata, public URLs (HQ)
│   ├── userService.js        # User queries (interns, staff)
│   └── auditService.js       # Audit logging
│
├── utils/                     # Shared utility functions
│   ├── logger.js             # Structured logging (debug/info/warn/error)
│   ├── validators.ts         # Input validation helpers (TypeScript)
│   ├── errorHandler.js       # Error handling wrappers
│   ├── date.js               # Date formatting and period helpers
│   ├── format.js             # Currency, number, bytes formatting
│   └── storage.js            # localStorage convenience wrappers
│
├── js/shared/                 # Shared types and UI logic
│   ├── types.ts              # All domain interfaces (TypeScript)
│   ├── constants.js          # SKILL_LIST, STATUS_LABELS, KANBAN_COLS
│   ├── utils.js              # escapeHtml, badge, avatar, etc.
│   └── components/           # Reusable component renderers
│
├── hq/                        # HQ portal page modules (admin/supervisor)
│   ├── app.js                # HQ app shell, routing, realtime
│   ├── crm.js                # Clients & proposals pages
│   ├── operations.js         # Partners, documents, new project wizard
│   ├── finance.js            # Finance overview, AR, AP, payroll, BIR
│   ├── ai.js                 # AI assistant (Anthropic Claude)
│   └── hq.css                # HQ portal styles
│
├── icc/                       # Intern Command Center page modules
│   ├── app.js                # ICC app shell, routing, realtime
│   ├── dashboard.js          # Dashboard stat cards, activity feed
│   ├── tasks.js              # Kanban board, task CRUD, status transitions
│   ├── timesheets.js         # Timesheet entry, approval workflow
│   ├── outputs.js            # Output portfolio grid
│   ├── admin.js              # Approvals, intern overview, reports, exports
│   ├── account.js            # Account settings
│   └── intern.css            # ICC portal styles
│
├── lib/business/              # Business logic modules
│   ├── dashboardStats.js     # HQ + Intern dashboard stat builders
│   ├── ndaGenerator.js       # NDA document HTML generation
│   └── reportGenerator.js    # CSV/PDF report generation
│
├── css/                       # Shared component stylesheets
├── database/schema/           # Database schema SQL files
├── index.html                 # HQ portal entry point
├── intern.html                # Intern Command Center entry point
├── login.html                 # Shared login page
├── signup.html                # Intern signup page
├── vite.config.ts             # Vite bundler + Vitest config
├── tsconfig.json              # TypeScript config (allowJs: true, strict: false)
└── vercel.json                # Vercel deployment config
```

---

## Setup

### 1. Clone & Install Dependencies

```bash
git clone <repo-url>
cd destineVents-CommandCenter
npm install
```

### 2. Configure Supabase

Create a `.env.local` file in the project root:

```bash
cp .env.example .env.local   # if example exists, otherwise create manually
```

Add your Supabase credentials:

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

**Security:** `.env.local` is in `.gitignore` and will NOT be committed. For Vercel, add these same two variables under **Project Settings → Environment Variables**.

### 3. Database Setup

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Open the SQL Editor
3. Run `database/schema/supabase-setup.sql` to create all tables, RLS policies, and indexes
4. Run `database/schema/intern-schema.sql` for intern-specific tables
5. Enable the following Supabase features:
   - **Authentication**: Email/Password sign-in
   - **Realtime**: Enable for `clients`, `proposals`, `partners`, `invoices`, `bills`, `payroll_runs`, `documents`, `intern_tasks`, `intern_timesheets`, `intern_users` tables
   - **Storage**: Create a `documents` bucket for file uploads

### 4. Run Locally

```bash
npm run dev
```

Navigate to `http://localhost:5173/login.html` to sign in.

Other dev commands:
```bash
npm run build   # production build → dist/
npm test        # run Vitest unit tests
npm run lint    # ESLint
```

---

## Deployment

The project deploys to Vercel as a static site. No build step — Vercel serves files directly from the repo root:

```bash
npx vercel --prod
```

`vercel.json` sets `buildCommand: ""` and `outputDirectory: "."`, so Vite is not invoked during deployment. The `/` → `/login.html` redirect handles the root URL.

---

## Architecture

### Two Portals

| Portal | URL | Users | Features |
|--------|-----|-------|----------|
| **HQ** | `/index.html` | Admin, Supervisor | CRM, proposals, finance, documents, partners, AI assistant, NDA wizard |
| **Intern** | `/intern.html` | Intern, Supervisor, Admin | Tasks (Kanban), timesheets, output portfolio, approvals, reports |

### Authentication Flow

```
login.html → signIn() → supabase.auth.signInWithPassword()
    ↓
getProfile(user.id) → intern_users.role  (DB is the source of truth)
    ↓
admin? → role-picker (HQ or Intern)
other? → intern.html redirect
```

### Data Flow

```
HTML Page
  ↓ script load (config → supabase → services → business → components → pages)
Page Module (e.g., crm.js)
  ↓ calls
Domain Service (e.g., clientService.js)
  ↓ queries via
Supabase Client (supabase.js)
  ↓ returns data directly (no {data, error} wrapping)
Caller checks `if (!result) return;`
```

### Service Layer Pattern

Each domain service follows this pattern:

```js
async function fetchXxx() {
  try {
    const { data, error } = await sb.from('table').select('*');
    if (error) return handleServiceError(error, 'fetchXxx');
    return data || [];
  } catch (err) {
    return handleServiceError(err, 'fetchXxx');
  }
}
```

Services return data directly on success, `null`/`[]` on error. Callers use:
```js
const result = await fetchXxx();
if (!result) return; // error already shown via toast
// use result...
```

---

## Features

### HQ Portal
- **Dashboard** — Pipeline overview, recent activity, revenue chart, quick stats
- **CRM** — Client and proposal management with win-rate tracking
- **New Project Wizard** — Client intake → NDA preview → save project
- **Finance** — AR/AP overview, invoice/bill/payroll CRUD, BIR tax calendar
- **Partners** — Filterable partner directory (Schools, LGUs, NGOs, etc.)
- **Document Vault** — File upload to Supabase Storage with metadata
- **AI Assistant** — Template-based content generation via Anthropic Claude

### Intern Portal
- **Dashboard** — Approved hours, active/completed tasks, skill activity chart, recent timesheets
- **Tasks (Kanban)** — Assign tasks, status transitions (assigned → acknowledged → in_progress → completed → reviewed), output linking
- **Timesheets** — Daily hour logging with skill tagging, approval workflow
- **Output Portfolio** — Grid of completed task outputs with links
- **Approvals** — Supervisor/admin queue for timesheet approval/rejection
- **Intern Overview** — Per-intern stats (hours, tasks, skills)
- **Reports** — System overview, per-intern timesheet export (CSV/PDF)

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| No framework | Maximum simplicity, zero build step, direct DOM manipulation |
| Services return data directly | Eliminates `if (error)` boilerplate — errors handled centrally via `handleServiceError` with toast |
| Config imported via `<script>` tags | No bundler needed, global constants available everywhere |
| Event delegation on `[data-action]` | Single document listener for all interactive elements — clean, maintainable |
| inline `onclick` in HQ + delegated in intern | HQ uses inline handlers for simplicity; intern uses delegation for cleanliness |
| `logAudit()` requires `performedBy` | Removes dependency on `currentUser` global, making the function testable |

---

## Security Notes

- **Supabase credentials**: Loaded from `.env.local` via `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (gitignored). The anon key is public by design — Supabase Row-Level Security protects all data
- **XSS prevention**: All user-rendered data passes through `escapeHtml()` before `innerHTML` assignment
- **Auth**: Supabase Auth with Row-Level Security policies on all tables
- **File uploads**: Supabase Storage with bucket-level security
- **AI API key**: Stored in `localStorage` — visible to any JS on the domain

---

## Known Limitations

- HQ portal page modules are plain JS globals (no TypeScript, no module imports)
- `strict: false` in tsconfig — full strict mode is a future migration step
- Realtime self-notifications not filtered (user sees own changes)
- AI assistant requires manual Anthropic API key entry (stored in localStorage)
- No CI pipeline — tests run manually via `npm test`
- No offline support
- No dark mode
- Mobile experience is functional but not optimized

---

## Future Improvements

- Add Playwright E2E tests for critical user journeys
- Implement proper focus trapping in modals
- Add push notifications for approvals
- Implement data export for all tables
- Add user preference persistence
- Add keyboard shortcuts for common actions
- Implement dark/light theme toggle
- Add comprehensive error tracking (Sentry)

---

## Contributing

1. Create a feature branch from `main`
2. Make changes, keeping existing patterns
3. Verify scripts load in correct order in HTML
4. Test both portals (HQ + Intern)
5. Open a pull request

### Coding Conventions

- `camelCase` for all identifiers
- `async/await` for all Supabase calls
- `function` keyword for global functions
- No class syntax
- No template literals with complex expressions
- Services return `null` on error, never throw
- HTML escaping via `escapeHtml()` for all user data

---

## License

Internal tool — DestineVents Collective OPC
