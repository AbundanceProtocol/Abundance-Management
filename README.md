# Project Manager — GTD + CPM

**Project Manager** is a self-hosted web app for personal and team-style task management. It combines **Getting Things Done (GTD)** workflows (sections, capture, review) with **Critical Path Method (CPM)** ideas (critical-path marking and a timeline view) so you can see both *what* to do and *what blocks* delivery.

It is built with **Next.js** (App Router), **React**, and **TypeScript**. Data lives in **MongoDB**, **PostgreSQL**, or **SQLite**—you choose at first-time setup or via configuration.

---

## Main features

### Task board (GTD)

- **Three section types** out of the box: **Project**, **Recurring**, and **To Do List** (defaults are created when the database is empty).
- **Deep hierarchy** (up to **5 visual tiers**, depth `0`–`4`): section row → subtask → nested subtasks, with indentation scaled by level.
- **Drag and drop** (dnd-kit): drop **on** a row to insert **before** it as a sibling; use the **strip below** a row for **after** (quick drop) or **hover that strip for 2 seconds** then drop to **nest inside** (respects max depth).
- **Board layout modes**: **All tasks**, **Today’s focus** (daily focus list with a 2:00am local reset), **Project-focused** (critical-path / project-centric view when a project section exists), and **Completed** history.
- **Per-section options**: collapse, **sequential** top-level tasks (children in order), **top-level sort** (manual, priority, start date), optional **group by category** with category headings.
- **Task detail**: title, completion, **priority**, **time estimates** (minutes / hours / days), **notes**, **multiple URLs**, **start / due dates** and optional **due time**, **tags**, **category** (for grouping), **collapse** row state.

### Recurring & habits

- **Repeat frequency**: none, daily, weekly (with weekday selection), or monthly.
- **Completion history** and optional **task weight** (1–10) for recurring stats.
- **Recurring notes page** linkage and **“complete until”** time-based UI for habits.

### Critical path & scheduling

- **Critical path** flag on tasks; surfaced on a **Gantt-style timeline** for the main **project** section (e.g. Product Launch).
- **Project-focused** board mode ties into critical-path / timeline behavior.

### Task workspaces & pages

- **Per-task workspace** route (`/task/[taskId]/…`): rich **markdown / canvas-style workspace** on the anchor task, **subtasks** when parents **hide subtasks on main board**, and linked **standalone pages**.
- **Pages** area (`/pages`): hierarchical **markdown pages** with drag-and-drop ordering/nesting, blocks, and a configurable **pages environment** (navigation and layout).

### Data & backup

- **JSON backup export** and **restore** (replace all sections, tasks, and optional pages environment)—from **Settings**.
- **Reset application data** (danger zone): wipe tasks/sections/pages config while **keeping login accounts**; requires typing a confirmation phrase.
- **Reset database connection** (danger zone, after DB setup): clears stored engine and connection settings, **keeps the auth secret** (from config or `AUTH_SECRET`), signs you out, and sends you to **`/setup`** to pick a **new** database and admin user. Data on the old database is not deleted remotely.

### Authentication & setup

- **First-time setup** (`/setup`): pick **MongoDB**, **PostgreSQL**, or **SQLite**, test the connection, set **auth secret** (or auto-generate), and create an **admin** username / password / email.
- **Login**: username + password after setup, or legacy single **APP_PASSWORD** (env) when setup is skipped that way.
- **Development**: optional `SKIP_AUTH=true` to bypass login locally.
- **Session cookies** signed with **AUTH_SECRET** or the secret stored in `data/app-config.json` after setup.
- **Settings → Account** (database login mode): change **username** and/or **password** (current password required); legacy `APP_PASSWORD` users are directed to change env instead.

### Technical

- **Pluggable storage**: one abstraction (`AppDataStore`) with MongoDB, PostgreSQL, and SQLite implementations.
- **Dark-themed** UI, responsive layout with mobile-oriented controls on narrow viewports.

---

## Getting started

### Prerequisites

- **Node.js** 20+
- One of: **MongoDB** (local or Atlas), **PostgreSQL**, or **SQLite** (file—no separate server)

### Install & run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

On first launch (with `AUTH_SECRET` set and without `APP_PASSWORD` / completed setup), you’ll be sent to **`/setup`** to choose the database and admin account.

**Optional** `.env.local` examples:

- `AUTH_SECRET` — signing key for sessions (or rely on the secret written at setup).
- `SKIP_AUTH=true` — skip login in development only.
- `APP_PASSWORD` — legacy single shared password (skips the setup wizard when used as intended).
- `MONGODB_URI` — fallback Mongo connection when not using stored setup config (Mongo engine).

### Production build

```bash
npm run build
npm start
```

Local app data (e.g. `data/app-config.json`, SQLite file) is gitignored under `data/` by default.
