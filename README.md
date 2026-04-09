# Project Manager — GTD + CPM

**Project Manager** is a self-hosted web app for personal and team-style task management. It combines **Getting Things Done (GTD)** workflows (sections, capture, review) with **Critical Path Method (CPM)** ideas (critical-path marking and a timeline view) so you can see both *what* to do and *what blocks* delivery.

Built with **Next.js** (App Router), **React**, and **TypeScript**. Data lives in **MongoDB**, **PostgreSQL**, or **SQLite**—you choose at first-time setup or via configuration.

---

## Features

### Task board (GTD)

- **Three section types** out of the box: **Project**, **Recurring**, and **To Do List** (defaults are created when the database is empty).
- **Deep hierarchy** (up to **5 visual tiers**, depth `0`–`4`): section row → subtask → nested subtasks, with indentation scaled by level.
- **Drag and drop** (dnd-kit): drop **on** a row to insert **before** it as a sibling; use the **strip below** a row for **after** (quick drop) or **hover that strip for 2 seconds** then drop to **nest inside** (respects max depth).
- **Board layout modes**: **All tasks**, **Today's focus**, **Week's focus**, **Project-focused** (critical-path timeline view), and **Completed** history—toggled via a segmented control.
- **Per-section options**: collapse, **sequential** top-level tasks (children run in order), **top-level sort** (manual, priority, start date), optional **group by category** with category headings.
- **Task fields**: title, completion toggle, **priority** (high / medium / low), **time estimates** (minutes / hours / days), **notes**, **multiple URLs**, **start / due dates** and optional **due time**, **tags**, **category**, **collapse** state, **hide subtasks on main board**, and **lock subtask drag-reorder**.
- **Duplicate task**: copies a task and its entire subtree as a sibling below the original. Available from the detail panel and the task zoom page.

### Today's Focus & Week's Focus

- Tasks are manually flagged for **Today's Focus** via a checkbox in the detail panel, storing a `todayFocusDate` that resets at **2:00 AM local time** each day.
- The **Today** board mode shows only flagged tasks plus their ancestors and children; collapse state is automatically cleared so the full context is visible.
- **Week's Focus** works the same way scoped to the current week.

### Task detail panel

A 380 px right-side panel that opens when a task is selected, exposing all task metadata in one place:

- Title, notes, priority, due date/time, time estimate, category, tags, URLs
- Recurring settings (frequency, weekday selection, task weight)
- Parent-task picker, subtask controls
- **Google Calendar sync** button
- Mind map and workspace links
- **Duplicate** button
- **Lock subtask drag** toggle (prevents child tasks from being drag-reordered)

### Task zoom page (`/task/[taskId]`)

Focused single-task view that displays the anchor task at the top followed by its full subtree:

- Drag-reorder subtasks (with nesting via hover-strip); the anchor row itself is fixed.
- Create new child tasks, duplicate any node, toggle collapse, delete with confirmation.
- Completed tasks remain visible so the anchor is always addressable.

### Task workspaces & pages

- **Per-task workspace** (`/task/[taskId]/workspace`): rich **markdown / canvas-style workspace** attached to a task, with linked standalone pages.
- **Pages** area (`/pages`): hierarchical **markdown pages** with drag-and-drop ordering and nesting, blocks, and a configurable pages environment (navigation and layout).

### Recurring tasks & habits

- **Repeat frequency**: none, daily, weekly (with weekday selection), or monthly.
- **Completion history** and optional **task weight** (1–10) for recurring stats.
- **Recurring notes page** linkage and **"complete until"** time-based state for habits.
- **Habit calendar**: month-view grid in the section detail showing weighted daily completion percentages—color-coded green / yellow / red / gray by threshold.

### Critical path & scheduling

- **Critical path** flag on tasks; surfaced on a **Gantt-style timeline** for the main project section.
- **Project-focused** board mode ties into critical-path / timeline behavior.

### Calendar

- **Embedded calendar**: month-view grid accessible via the **Calendar** viz mode on the main board, showing due-date tasks as color-coded chips (chip color = priority, dot color = section type).
- **Standalone calendar page** (`/calendar`): full-page version with a task-count header, toggleable completed-task display, and a side detail panel for selected tasks.
- **Day zoom modal**: tap a day cell (mobile) or double-click (desktop) to open a detailed list of all tasks due that day, sorted by time, with time, section, and priority shown for each.
- **"+N more"** overflow chip on busy days opens the same day zoom modal.

### Mind maps (`/mind-maps`)

A visual node-and-link graph editor for brainstorming and structuring ideas:

- Four node types: **idea**, **task**, **note**, **URL**.
- Add parent-child connections with customizable line styles (Bezier, step, orthogonal, etc.).
- Drag nodes to reposition; edit labels inline.
- Nodes can be **linked to actual tasks** in the system.
- Maps are saved and recalled per document.

### Google Calendar sync

- Eligible tasks (top-level, with a due date, non-recurring, non-completed) are pushed to Google Calendar as **timed or all-day events**.
- Events are **color-coded by priority**: high = Tomato, medium = Banana, low = Sage.
- Bulk sync via `/api/google-calendar/sync`; per-task sync triggered on create/update.
- OAuth tokens auto-refresh; sync status (`synced` / `pending` / `error`) is stored on each task.
- Configure via **Settings → Google Calendar**.

### Mobile experience

- **Responsive layout**: narrow viewports (≤ 768 px) switch to mobile-optimised controls throughout.
- **Quick Access FAB**: a floating button in the bottom-right corner (mobile only) that slides up a bottom sheet containing:
  - **Navigation strip** — one-tap links to Tasks, Pages, Mind Maps, and Calendar.
  - **Top 5 active tasks** — ranked by most-recent subtask activity (adding or completing subtasks). Tapping a task navigates to its zoom page.
- **Calendar tap-to-zoom**: on mobile, a single tap on a day cell opens the day zoom modal (replaces the desktop double-click).

### Data & backup

- **JSON backup export** and **restore** (replace all sections, tasks, and optional pages environment) — from **Settings**.
- **Reset application data** (danger zone): wipes tasks / sections / pages config while keeping login accounts; requires typing a confirmation phrase.
- **Reset database connection** (danger zone): clears stored engine and connection settings, keeps the auth secret, signs you out, and redirects to `/setup` to pick a new database. Data on the old database is not deleted remotely.

### Authentication & setup

- **First-time setup** (`/setup`): choose **MongoDB**, **PostgreSQL**, or **SQLite**, test the connection, set an auth secret (or auto-generate), and create an admin username / password / email.
- **Login**: username + password after setup, or legacy single `APP_PASSWORD` (env) when setup was skipped.
- **Development**: optional `SKIP_AUTH=true` to bypass login locally.
- **Session cookies** signed with `AUTH_SECRET` or the secret stored in `data/app-config.json` after setup.
- **Settings → Account**: change username and/or password (current password required).

---

## Getting started

### Prerequisites

- **Node.js** 20+
- One of: **MongoDB** (local or Atlas), **PostgreSQL**, or **SQLite** (file — no separate server needed)

### Install & run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

On first launch you'll be sent to **`/setup`** to choose the database and create an admin account.

**Optional `.env.local` variables:**

| Variable | Purpose |
|---|---|
| `AUTH_SECRET` | Signing key for session cookies (or rely on the secret written at setup) |
| `SKIP_AUTH=true` | Bypass login in development |
| `APP_PASSWORD` | Legacy single shared password (skips setup wizard) |
| `MONGODB_URI` | Fallback Mongo connection when not using stored setup config |

### Production build

```bash
npm run build
npm start
```

Local app data (`data/app-config.json`, SQLite file) is gitignored under `data/` by default.
