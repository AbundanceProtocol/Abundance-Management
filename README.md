# Abundance Strategy — GTD + CPM

A Getting Things Done (GTD) task manager with Critical Path Method (CPM) capabilities, built with Next.js and MongoDB.

## Features

- **Three main sections**: Project, Recurring, To Do List
- **Deep hierarchy**: up to **5 visual tiers** (depth `0`–`4`: section row → sub-task → sub-sub-task → …). Indentation scales per level.
- **Drag and drop**: drop **on** a row to insert **before** it (sibling). Use the **strip below** a row — **quick** drop moves your task **after** that row; **hover that strip ≥2s** then drop to **nest inside** that row (respects max depth)
- **Task properties**: time estimates, notes, URLs, start/due dates
- **Critical Path flagging** to identify bottleneck tasks (shown on a **Gantt-style timeline** at the top for the Project / Product Launch section)
- **Sequential mode** to mark parent tasks whose children must be done in order
- **Dark theme** UI

## Getting Started

### Prerequisites

- Node.js 20+
- MongoDB running locally (or a MongoDB Atlas connection string)

### Setup

```bash
npm install
```

Configure your MongoDB connection in `.env.local`:

```
MONGODB_URI=mongodb://localhost:27017/abundance-strategy
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build

```bash
npm run build
npm start
```
