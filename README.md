# DestineVents Command Center

A dual-portal operations management platform for **DestineVents Collective OPC**, a Baguio City-based event management and community development company. The platform manages the full business pipeline — CRM, proposals, finance, document vault, partner network — alongside an intern management subsystem for task assignment, timesheets, approvals, and reporting.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Vanilla HTML5, CSS3, JavaScript (ES6+) |
| **Backend** | Supabase (PostgreSQL, Auth, Realtime, Storage) |
| **Deployment** | Vercel (static SPA) |
| **CDN** | `@supabase/supabase-js@2` (via jsdelivr) |
| **Fonts** | Google Fonts (DM Sans, Cormorant Garamond, Dancing Script) |

### Principles

- No frameworks (no React, Vue, Angular, TypeScript)
- No bundlers or build step
- CDN-only dependencies
- All business logic in plain JS
- Event delegation for UI interactions

---

## Project Structure

```
destineVents-CommandCenter/
├── config/                    # App configuration (gitignored)
│   ├── config.js             # Supabase credentials (NOT in git)
│   ├── config.example.js     # Template for credentials
│   ├── roles.js              # Role hierarchy, permissions, routes
│   └── settings.js           # App constants (brands, rates, statuses)
│
├── services/                  # Domain service layer (Supabase queries)
│   ├── supabase.js           # Supabase client singleton
│   ├── authService.js        # signIn, signOut, getSession, getCurrentUser
│   ├── clientService.js      # Clients CRUD
│   ├── proposalService.js    # Proposals CRUD + win rate calc
│   ├── partnerService.js     # Partners CRUD + filtering
│   ├── financeService.js     # Invoices, bills, payroll CRUD + summaries
│   ├── documentService.js    # Document upload, metadata, public URLs
│   ├── userService.js        # User queries (interns, staff)
│   ├── taskService.js        # Tasks CRUD + status transitions
│   ├── timesheetService.js   # Timesheets CRUD + stats
│   └── auditService.js       # Audit logging
│
├── utils/                     # Shared utility functions
│   ├── logger.js             # Structured logging (debug/info/warn/error)
│   ├── validators.js         # Input validation helpers
│   ├── errorHandler.js       # Error handling wrappers
│   ├── date.js               # Date formatting and period helpers
│   ├── format.js             # Currency, number, bytes formatting
│   └── storage.js            # localStorage convenience wrappers
│
├── lib/business/              # Business logic modules
│   ├── dashboardStats.js     # HQ + Intern dashboard stat builders
│   ├── ndaGenerator.js       # NDA document HTML generation
│   └── reportGenerator.js    # CSV/PDF report generation
│
├── js/                        # Application code
│   ├── login.js              # Login page logic
│   ├── hq/                   # HQ portal (admin/supervisor)
│   │   ├── app.js            # HQ app shell, routing, realtime
│   │   ├── crm.js            # Clients & proposals pages
│   │   ├── operations.js     # Partners, documents, new project wizard
│   │   ├── finance.js        # Finance overview, AR, AP, payroll, BIR
│   │   └── ai.js             # AI assistant (Anthropic Claude)
│   ├── intern/               # Intern portal
│   │   ├── app.js            # Intern app shell, routing, realtime
│   │   ├── dashboard.js      # Dashboard stat cards, activity feed
│   │   ├── tasks.js          # Kanban board, task CRUD, status transitions
│   │   ├── timesheets.js     # Timesheet entry, approval workflow
│   │   ├── outputs.js        # Output portfolio grid
│   │   └── admin.js          # Approvals, intern overview, reports, exports
│   └── shared/               # Shared UI logic
│       ├── constants.js      # SKILL_LIST, STATUS_LABELS, KANBAN_COLS
│       ├── utils.js          # escapeHtml, badge, avatar, etc.
│       └── components/       # Reusable component renderers
│           ├── toast.js      # Toast notifications
│           ├── modal.js      # Modal dialog management
│           ├── statCard.js   # Stat card grid
│           ├── badge.js      # Status/priority badges
│           ├── table.js      # Table renderer
│           ├── filterTabs.js # Filter tab bar
│           ├── emptyState.js # Empty state placeholder
│           ├── loadingSpinner.js
│           └── userChip.js   # User avatar + name chip
│
├── css/                       # Stylesheets
│   ├── hq.css                # HQ portal styles
│   ├── intern.css            # Intern portal styles
│   ├── login.css             # Login page styles
│   └── components/           # Shared component styles
│       ├── avatar.css        # Avatar circles
│       ├── badge.css         # Status and priority badges
│       ├── button.css        # Button system
│       ├── empty-state.css   # Empty state placeholders
│       ├── form.css          # Form inputs, selects, textareas
│       ├── layout.css        # Grid, flex helpers
│       ├── login.css         # Login screen layout
│       ├── modal.css         # Dialog overlay + box
│       ├── stat-card.css     # Stat card grid items
│       ├── surface.css       # Card/surface containers
│       ├── table.css         # Table styles
│       └── toast.css         # Toast notification styles
│
├── database/schema/           # Database schema files
│   ├── supabase-setup.sql    # Full schema setup
│   └── intern-schema.sql     # Intern-specific tables
│
├── index.html                 # HQ portal entry point
├── intern.html                # Intern portal entry point
├── login.html                 # Shared login page
├── vercel.json                # Vercel deployment config
└── config.example.js          # Template for root config (gitignored)
```

---

## Setup

### 1. Clone & Install Dependencies

```bash
git clone <repo-url>
cd destineVents-CommandCenter
```

No package manager needed — the only dependency (`@supabase/supabase-js`) is loaded via CDN in the HTML files.

### 2. Configure Supabase

Copy the example config and fill in your Supabase credentials:

```bash
cp config/config.example.js config/config.js
```

Edit `config/config.js`:

```js
const SUPABASE_URL      = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
```

**Security:** `config/config.js` is in `.gitignore` and will NOT be committed.

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

Open any of the HTML files directly in a browser, or serve with a local HTTP server:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then navigate to `http://localhost:8080/login.html` to sign in.

---

## Deployment

The project deploys to Vercel as a static SPA:

```bash
npx vercel --prod
```

The `vercel.json` routes all 404s to `login.html` for SPA-like behavior.

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
session.user.user_metadata.role
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

- **Supabase anon key**: Stored in `config/config.js` (gitignored). The key is public by design (Supabase Row-Level Security protects data)
- **XSS prevention**: All user-rendered data passes through `escapeHtml()` before `innerHTML` assignment
- **Auth**: Supabase Auth with Row-Level Security policies on all tables
- **File uploads**: Supabase Storage with bucket-level security
- **AI API key**: Stored in `localStorage` — visible to any JS on the domain

---

## Known Limitations

- No unit tests or integration tests
- No TypeScript types or JSDoc annotations
- Supabase client is global (`window.supabase`)
- Realtime self-notifications not filtered (user sees own changes)
- AI assistant requires manual Anthropic API key entry
- No offline support
- No dark mode
- Mobile experience is functional but not optimized

---

## Future Improvements

- Add automated tests (Playwright for E2E, Vitest for unit)
- Add TypeScript with JSDoc type annotations
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
