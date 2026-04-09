"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { TaskItem, Section } from "@/lib/types";
import { ChevronLeft, ChevronRight } from "./Icons";
import { useViewportNarrow } from "@/lib/useViewportNarrow";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_FULL = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];
const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function makeYmd(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function todayYmd(): string {
  const d = new Date();
  return makeYmd(d.getFullYear(), d.getMonth(), d.getDate());
}

/** "14:30" → "2:30 PM"  |  "09:00" → "9:00 AM"  |  "00:00" → "12:00 AM" */
function formatTime12h(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mPart = m === 0 ? "" : `:${String(m).padStart(2, "0")}`;
  return `${h12}${mPart} ${ampm}`;
}

/** Compact chip version: "2:30p"  |  "9a"  |  "12p" */
function formatTimeChip(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const suffix = h >= 12 ? "p" : "a";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mPart = m === 0 ? "" : `:${String(m).padStart(2, "0")}`;
  return `${h12}${mPart}${suffix}`;
}

/** Sort tasks: timed first (ascending), then untimed. */
function sortByTime(tasks: TaskItem[]): TaskItem[] {
  return [...tasks].sort((a, b) => {
    if (a.dueTime && b.dueTime) return a.dueTime.localeCompare(b.dueTime);
    if (a.dueTime) return -1;
    if (b.dueTime) return 1;
    return 0;
  });
}

const PRIORITY_BG: Record<string, string> = {
  high: "rgba(239,68,68,0.16)",
  medium: "rgba(245,158,11,0.16)",
  low: "rgba(148,163,184,0.16)",
};
const PRIORITY_BORDER: Record<string, string> = {
  high: "rgba(239,68,68,0.5)",
  medium: "rgba(245,158,11,0.5)",
  low: "rgba(148,163,184,0.4)",
};
const PRIORITY_BG_SEL: Record<string, string> = {
  high: "rgba(239,68,68,0.30)",
  medium: "rgba(245,158,11,0.28)",
  low: "rgba(148,163,184,0.28)",
};
const PRIORITY_COLOR: Record<string, string> = {
  high: "rgb(220,38,38)",
  medium: "rgb(180,120,0)",
  low: "rgb(100,116,139)",
};

const SECTION_DOT: Record<string, string> = {
  project: "#3b82f6",
  todo: "#8b5cf6",
  recurring: "#22c55e",
};

/** Max task chips shown per cell before "+N more". */
const MAX_VISIBLE = 3;

interface Props {
  tasks: TaskItem[];
  sections: Section[];
  onSelectTask?: (id: string) => void;
  selectedTaskId?: string | null;
  /** When true renders a larger grid suitable for a full-page view. */
  fullPage?: boolean;
}

// ─── Day Zoom Modal ───────────────────────────────────────────────────────────

interface DayZoomProps {
  dateYmd: string;
  tasks: TaskItem[];
  sectionById: Map<string, Section>;
  selectedTaskId?: string | null;
  onSelectTask?: (id: string) => void;
  onClose: () => void;
}

function DayZoomModal({
  dateYmd,
  tasks,
  sectionById,
  selectedTaskId,
  onSelectTask,
  onClose,
}: DayZoomProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay so the click that opened the modal doesn't immediately close it
    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", handler);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  // Parse date for heading
  const [yearStr, monthStr, dayStr] = dateYmd.split("-");
  const y = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10) - 1;
  const d = parseInt(dayStr, 10);
  const weekday = new Date(y, m, d).getDay();
  const heading = `${WEEKDAY_FULL[weekday]}, ${MONTH_FULL[m]} ${d}`;

  const sorted = sortByTime(tasks);

  return (
    // Backdrop
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        ref={panelRef}
        style={{
          background: "var(--bg-primary)",
          border: "1px solid var(--border-color)",
          borderRadius: 12,
          width: "100%",
          maxWidth: 480,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          overflow: "hidden",
        }}
      >
        {/* Modal header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px 12px",
            borderBottom: "1px solid var(--border-color)",
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "var(--text-primary)",
                letterSpacing: "-0.01em",
              }}
            >
              {heading}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                marginTop: 2,
              }}
            >
              {sorted.length} task{sorted.length !== 1 ? "s" : ""} due
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close (Esc)"
            style={{
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border-color)",
              borderRadius: 6,
              padding: "4px 8px",
              cursor: "pointer",
              fontSize: 13,
              color: "var(--text-muted)",
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* Task list */}
        <div style={{ overflowY: "auto", padding: "8px 0" }}>
          {sorted.length === 0 ? (
            <div
              style={{
                padding: "24px 18px",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 13,
              }}
            >
              No tasks due this day.
            </div>
          ) : (
            sorted.map((t) => {
              const sec = sectionById.get(t.sectionId);
              const pri = t.priority ?? "medium";
              const isSelected = t._id === selectedTaskId;
              const dot = sec ? (SECTION_DOT[sec.type] ?? "#94a3b8") : "#94a3b8";

              return (
                <button
                  key={t._id}
                  type="button"
                  onClick={() => {
                    onSelectTask?.(t._id);
                    onClose();
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "10px 18px",
                    border: "none",
                    background: isSelected
                      ? PRIORITY_BG_SEL[pri]
                      : "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    borderLeft: isSelected
                      ? `3px solid ${PRIORITY_BORDER[pri]}`
                      : "3px solid transparent",
                  }}
                >
                  {/* Time column */}
                  <div
                    style={{
                      minWidth: 56,
                      fontSize: 12,
                      fontWeight: 600,
                      color: t.dueTime
                        ? PRIORITY_COLOR[pri]
                        : "var(--text-muted)",
                      fontVariantNumeric: "tabular-nums",
                      paddingTop: 1,
                      flexShrink: 0,
                    }}
                  >
                    {t.dueTime ? formatTime12h(t.dueTime) : "All day"}
                  </div>

                  {/* Section dot */}
                  <span
                    aria-hidden
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: dot,
                      flexShrink: 0,
                      marginTop: 4,
                    }}
                  />

                  {/* Task info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: "var(--text-primary)",
                        lineHeight: 1.35,
                        wordBreak: "break-word",
                      }}
                    >
                      {t.title || "Untitled"}
                    </div>
                    {sec && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                          marginTop: 2,
                        }}
                      >
                        {sec.title}
                      </div>
                    )}
                  </div>

                  {/* Priority pill */}
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "2px 6px",
                      borderRadius: 10,
                      background: PRIORITY_BG[pri],
                      color: PRIORITY_COLOR[pri],
                      flexShrink: 0,
                      alignSelf: "center",
                      textTransform: "capitalize",
                    }}
                  >
                    {pri}
                  </span>
                </button>
              );
            })
          )}
        </div>

      </div>
    </div>
  );
}

// ─── Main Calendar Component ──────────────────────────────────────────────────

export default function TasksCalendarView({
  tasks,
  sections,
  onSelectTask,
  selectedTaskId,
  fullPage = false,
}: Props) {
  const isNarrow = useViewportNarrow();

  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });

  /** Date string (YYYY-MM-DD) of the currently zoomed day, or null. */
  const [zoomedDay, setZoomedDay] = useState<string | null>(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const dim = daysInMonth(year, month);
  const today = todayYmd();
  const firstWeekday = new Date(year, month, 1).getDay();

  const sectionById = useMemo(() => {
    const map = new Map<string, Section>();
    for (const s of sections) map.set(s._id, s);
    return map;
  }, [sections]);

  /** Non-completed tasks that have a dueDate, grouped by date, sorted by time. */
  const tasksByDate = useMemo(() => {
    const map = new Map<string, TaskItem[]>();
    for (const t of tasks) {
      if (!t.dueDate || t.completed || (t.repeatFrequency && t.repeatFrequency !== "none")) continue;
      const arr = map.get(t.dueDate) ?? [];
      arr.push(t);
      map.set(t.dueDate, arr);
    }
    // Sort each day's tasks by time
    for (const [k, v] of map) {
      map.set(k, sortByTime(v));
    }
    return map;
  }, [tasks]);

  const cells = useMemo(() => {
    const list: { day: number; dateYmd: string; inMonth: boolean }[] = [];
    for (let i = 0; i < firstWeekday; i++) {
      list.push({ day: 0, dateYmd: "", inMonth: false });
    }
    for (let d = 1; d <= dim; d++) {
      list.push({ day: d, dateYmd: makeYmd(year, month, d), inMonth: true });
    }
    while (list.length % 7 !== 0) {
      list.push({ day: 0, dateYmd: "", inMonth: false });
    }
    return list;
  }, [year, month, dim, firstWeekday]);

  const monthLabel = cursor.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  const minCellH = fullPage ? 110 : 80;
  const chipFontSize = fullPage ? 11 : 10;

  const zoomedTasks = zoomedDay ? (tasksByDate.get(zoomedDay) ?? []) : [];

  return (
    <>
      <div
        style={{
          margin: fullPage ? "0" : "0 24px 16px",
          padding: fullPage ? "16px 20px" : "14px 16px",
          borderRadius: 10,
          border: "1px solid var(--border-color)",
          background: "var(--bg-secondary)",
          fontSize: 12,
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontWeight: 700,
              fontSize: fullPage ? 15 : 13,
              color: "var(--text-primary)",
            }}
          >
            Due Dates
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              onClick={() =>
                setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))
              }
              title="Previous month"
              style={NAV_BTN}
            >
              <ChevronLeft size={15} />
            </button>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-primary)",
                minWidth: 148,
                textAlign: "center",
              }}
            >
              {monthLabel}
            </span>
            <button
              type="button"
              onClick={() =>
                setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))
              }
              title="Next month"
              style={NAV_BTN}
            >
              <ChevronRight size={15} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              const n = new Date();
              setCursor(new Date(n.getFullYear(), n.getMonth(), 1));
            }}
            title="Go to current month"
            style={{ ...NAV_BTN, fontSize: 11, padding: "4px 8px" }}
          >
            Today
          </button>
        </div>

        {/* ── Weekday headers ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
            gap: 3,
            marginBottom: 4,
          }}
        >
          {WEEKDAY_LABELS.map((l) => (
            <div
              key={l}
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "var(--text-muted)",
                textAlign: "center",
                padding: "2px 0 4px",
                letterSpacing: "0.04em",
              }}
            >
              {l}
            </div>
          ))}
        </div>

        {/* ── Calendar grid ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
            gap: 3,
          }}
        >
          {cells.map((cell, idx) => {
            if (!cell.inMonth) {
              return <div key={`pad-${idx}`} style={{ minHeight: minCellH }} />;
            }

            const isToday = cell.dateYmd === today;
            const isOverdue = cell.dateYmd < today;
            const dayTasks = tasksByDate.get(cell.dateYmd) ?? [];
            const overflowCount =
              dayTasks.length > MAX_VISIBLE ? dayTasks.length - MAX_VISIBLE : 0;
            const visibleTasks = dayTasks.slice(0, MAX_VISIBLE);
            const hasOverdueTasks = isOverdue && dayTasks.length > 0;

            return (
              <div
                key={cell.dateYmd}
                onClick={
                  isNarrow && dayTasks.length > 0
                    ? () => setZoomedDay(cell.dateYmd)
                    : undefined
                }
                onDoubleClick={
                  !isNarrow && dayTasks.length > 0
                    ? () => setZoomedDay(cell.dateYmd)
                    : undefined
                }
                title={
                  dayTasks.length > 0
                    ? isNarrow
                      ? `Tap to view all ${dayTasks.length} task${dayTasks.length !== 1 ? "s" : ""}`
                      : `Double-click to view all ${dayTasks.length} task${dayTasks.length !== 1 ? "s" : ""}`
                    : undefined
                }
                style={{
                  minHeight: minCellH,
                  borderRadius: 6,
                  border: isToday
                    ? "1.5px solid var(--accent-blue)"
                    : "1px solid var(--border-subtle, var(--border-color))",
                  background: isToday
                    ? "rgba(59,130,246,0.06)"
                    : hasOverdueTasks
                      ? "rgba(248,113,113,0.05)"
                      : "var(--bg-primary)",
                  padding: "4px 5px 5px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  cursor: dayTasks.length > 0 ? "pointer" : "default",
                }}
              >
                {/* Day number */}
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: isToday ? 700 : 500,
                    color: isToday
                      ? "var(--accent-blue)"
                      : "var(--text-secondary)",
                    lineHeight: 1.2,
                    marginBottom: 1,
                    userSelect: "none",
                  }}
                >
                  {cell.day}
                  {dayTasks.length > 0 && (
                    <span
                      aria-hidden
                      style={{
                        display: "inline-block",
                        width: 4,
                        height: 4,
                        borderRadius: "50%",
                        background: isToday
                          ? "var(--accent-blue)"
                          : "var(--text-muted)",
                        marginLeft: 3,
                        verticalAlign: "middle",
                        marginBottom: 1,
                        opacity: 0.6,
                      }}
                    />
                  )}
                </span>

                {/* Task chips */}
                {visibleTasks.map((t) => {
                  const sec = sectionById.get(t.sectionId);
                  const pri = t.priority ?? "medium";
                  const isSelected = t._id === selectedTaskId;
                  const dot = sec
                    ? (SECTION_DOT[sec.type] ?? "#94a3b8")
                    : "#94a3b8";

                  return (
                    <button
                      key={t._id}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onSelectTask?.(t._id); }}
                      onDoubleClick={(e) => e.stopPropagation()}
                      title={`${t.title || "Untitled"}${t.dueTime ? " · " + formatTime12h(t.dueTime) : ""}${sec ? " · " + sec.title : ""}`}
                      style={{
                        fontSize: chipFontSize,
                        lineHeight: 1.3,
                        padding: "2px 5px",
                        borderRadius: 4,
                        border: `1px solid ${isSelected ? PRIORITY_BORDER[pri] : "transparent"}`,
                        background: isSelected
                          ? PRIORITY_BG_SEL[pri]
                          : PRIORITY_BG[pri],
                        color: "var(--text-primary)",
                        cursor: "pointer",
                        textAlign: "left",
                        maxWidth: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 3,
                        minWidth: 0,
                      }}
                    >
                      {/* Section dot */}
                      <span
                        aria-hidden
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          background: dot,
                          flexShrink: 0,
                        }}
                      />

                      {/* Title */}
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        {t.title || "Untitled"}
                      </span>

                      {/* Time — right-aligned, prominent */}
                      {t.dueTime && (
                        <span
                          style={{
                            fontSize: chipFontSize,
                            fontWeight: 700,
                            color: PRIORITY_COLOR[pri],
                            flexShrink: 0,
                            fontVariantNumeric: "tabular-nums",
                            whiteSpace: "nowrap",
                            marginLeft: 2,
                            letterSpacing: "-0.01em",
                          }}
                        >
                          {formatTimeChip(t.dueTime)}
                        </span>
                      )}
                    </button>
                  );
                })}

                {/* Overflow — click opens zoom */}
                {overflowCount > 0 && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setZoomedDay(cell.dateYmd); }}
                    style={{
                      fontSize: 9,
                      color: "var(--accent-blue)",
                      paddingLeft: 3,
                      lineHeight: 1.4,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      padding: "0 0 0 3px",
                    }}
                  >
                    +{overflowCount} more
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Legend ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginTop: 10,
            flexWrap: "wrap",
          }}
        >
          {(
            [
              { label: "Project", color: SECTION_DOT.project },
              { label: "Todo", color: SECTION_DOT.todo },
              { label: "Recurring", color: SECTION_DOT.recurring },
            ] as const
          ).map(({ label, color }) => (
            <span
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10,
                color: "var(--text-muted)",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: color,
                  flexShrink: 0,
                }}
              />
              {label}
            </span>
          ))}
          <span
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              marginLeft: "auto",
            }}
          >
            {isNarrow ? "Tap" : "Double-click"} a day to zoom · "+more" to see all · chip color = priority
          </span>
        </div>
      </div>

      {/* ── Day Zoom Modal ── */}
      {zoomedDay && (
        <DayZoomModal
          dateYmd={zoomedDay}
          tasks={zoomedTasks}
          sectionById={sectionById}
          selectedTaskId={selectedTaskId}
          onSelectTask={onSelectTask}
          onClose={() => setZoomedDay(null)}
        />
      )}
    </>
  );
}

const NAV_BTN: React.CSSProperties = {
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border-color)",
  borderRadius: 6,
  padding: 4,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  color: "var(--text-muted)",
};
