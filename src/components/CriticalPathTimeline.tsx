"use client";

import React, { useMemo, useState, useEffect } from "react";
import { Section, TaskItem } from "@/lib/types";
import {
  buildProjectRanges,
  buildVisibleTaskTree,
  compareSiblingOrder,
  hasExplicitStartDate,
  tasksInSection,
  formatMonthShort,
  formatQuarter,
  addDays,
} from "@/lib/timelineUtils";
import { ChevronDown, ChevronRight } from "./Icons";

const MS_DAY = 86_400_000;
const ROW_H = 38;
const LABEL_W = 220;
const PIXELS_PER_DAY = 5;
const MIN_CHART_W = 880;

const SWIM_FILL = [
  "rgba(45, 212, 191, 0.82)",
  "rgba(248, 113, 113, 0.78)",
  "rgba(192, 132, 252, 0.78)",
  "rgba(74, 222, 128, 0.78)",
  "rgba(96, 165, 250, 0.78)",
  "rgba(251, 191, 36, 0.82)",
  "rgba(244, 114, 182, 0.78)",
  "rgba(52, 211, 153, 0.78)",
];

function parentIdsWithChildren(tasks: TaskItem[]): Set<string> {
  const s = new Set<string>();
  for (const t of tasks) {
    if (t.parentId) s.add(t.parentId);
  }
  return s;
}

function treeRoot(task: TaskItem, taskById: Map<string, TaskItem>): TaskItem {
  let cur = task;
  while (cur.parentId !== null) {
    const p = taskById.get(cur.parentId);
    if (!p) break;
    cur = p;
  }
  return cur;
}

function rgbaComponents(
  rgba: string
): { r: number; g: number; b: number; a: number } | null {
  const m = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return null;
  return {
    r: Number(m[1]),
    g: Number(m[2]),
    b: Number(m[3]),
    a: m[4] != null ? Number(m[4]) : 1,
  };
}

/** Deeper rows use lower alpha so subtasks read as lighter variants of the root color. */
function depthFillAlpha(depth: number): number {
  return Math.max(0.2, 0.9 - depth * 0.14);
}

/** Each top-level root gets a palette index; descendants share its RGB with depth-based alpha. */
function fillForDepthPalette(paletteIndex: number, depth: number): string {
  const base = SWIM_FILL[paletteIndex % SWIM_FILL.length]!;
  const c = rgbaComponents(base);
  if (!c) return base;
  const a = depthFillAlpha(depth);
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`;
}

function ganttBarButtonStyles(args: {
  treeFill: string;
  completed: boolean;
  isCp: boolean;
}): React.CSSProperties {
  const { treeFill, completed, isCp } = args;
  const baseBg = completed
    ? `repeating-linear-gradient(
        -45deg,
        rgba(255,255,255,0.07) 0px,
        rgba(255,255,255,0.07) 4px,
        transparent 4px,
        transparent 8px
      ),
      linear-gradient(rgba(15, 23, 42, 0.42), rgba(15, 23, 42, 0.42)),
      ${treeFill}`
    : treeFill;

  let border: string;
  let boxShadow: string;
  if (isCp) {
    border = "2px solid #f87171";
    boxShadow = completed
      ? "inset 0 0 0 1px rgba(248,113,113,0.35)"
      : "inset 0 0 0 1px rgba(248,113,113,0.25), 0 1px 2px rgba(0,0,0,0.2)";
  } else if (completed) {
    border = "2px solid rgba(34, 197, 94, 0.55)";
    boxShadow =
      "inset 0 0 0 1px rgba(34, 197, 94, 0.2), 0 1px 2px rgba(0,0,0,0.18)";
  } else {
    border = "1px solid rgba(255,255,255,0.22)";
    boxShadow = "0 1px 2px rgba(0,0,0,0.2)";
  }

  return {
    background: baseBg,
    border,
    boxShadow,
  };
}

function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

function eachMonthStart(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  let d = new Date(from.getFullYear(), from.getMonth(), 1);
  const endT = to.getTime();
  while (d.getTime() <= endT) {
    out.push(new Date(d));
    d = addMonths(d, 1);
  }
  return out;
}

interface Props {
  section: Section;
  tasks: TaskItem[];
  onSelectTask: (id: string) => void;
}

export default function CriticalPathTimeline({
  section,
  tasks,
  onSelectTask,
}: Props) {
  const allSectionTasks = useMemo(
    () => tasksInSection(tasks, section._id),
    [tasks, section._id]
  );

  /** Chart-only collapse (independent of task.collapsed in the list). */
  const [chartCollapsedIds, setChartCollapsedIds] = useState<Set<string>>(
    () => new Set()
  );

  useEffect(() => {
    setChartCollapsedIds(new Set());
  }, [section._id]);

  const topLevelSort = section.topLevelSort ?? "manual";

  const visibleTaskIds = useMemo(() => {
    const visible = buildVisibleTaskTree(
      allSectionTasks,
      null,
      chartCollapsedIds,
      topLevelSort
    );
    return new Set(visible.map((t) => t._id));
  }, [allSectionTasks, chartCollapsedIds, topLevelSort]);

  const { ranges, rangeStart, rangeEnd } = useMemo(() => {
    const full = buildProjectRanges(allSectionTasks, section);
    const visibleRanges = full.ranges.filter(
      (r) =>
        visibleTaskIds.has(r.task._id) &&
        (r.task.parentId !== null || hasExplicitStartDate(r.task))
    );
    return {
      ranges: visibleRanges,
      rangeStart: full.rangeStart,
      rangeEnd: full.rangeEnd,
    };
  }, [allSectionTasks, section, section.isSequential, section._id, visibleTaskIds]);

  const totalMs = Math.max(MS_DAY, rangeEnd.getTime() - rangeStart.getTime());
  const totalDays = totalMs / MS_DAY;

  const chartWidth = Math.max(MIN_CHART_W, Math.ceil(totalDays * PIXELS_PER_DAY));

  const months = useMemo(
    () => eachMonthStart(rangeStart, rangeEnd),
    [rangeStart, rangeEnd]
  );

  const rowById = useMemo(() => {
    const m = new Map<string, number>();
    ranges.forEach((r, i) => m.set(r.task._id, i));
    return m;
  }, [ranges]);

  const hasChildrenSet = useMemo(
    () => parentIdsWithChildren(allSectionTasks),
    [allSectionTasks]
  );

  const barFillForTask = useMemo(() => {
    const taskById = new Map(allSectionTasks.map((t) => [t._id, t]));
    const rootsOrdered = allSectionTasks
      .filter((t) => t.parentId === null)
      .sort((a, b) => compareSiblingOrder(a, b, true, topLevelSort));
    const rootColorIndex = new Map<string, number>();
    rootsOrdered.forEach((root, i) => rootColorIndex.set(root._id, i));

    return (task: TaskItem) => {
      const root = treeRoot(task, taskById);
      const paletteIndex = rootColorIndex.get(root._id) ?? 0;
      return fillForDepthPalette(paletteIndex, task.depth);
    };
  }, [allSectionTasks, topLevelSort]);

  const criticalChain = useMemo(() => {
    const c = ranges
      .filter((r) => r.task.isCriticalPath)
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    return c;
  }, [ranges]);

  const xPct = (d: Date) =>
    ((d.getTime() - rangeStart.getTime()) / totalMs) * 100;

  const yPct = (row: number) =>
    ranges.length === 0 ? 50 : ((row + 0.5) / ranges.length) * 100;

  const todayLineLeftPx = useMemo(() => {
    if (ranges.length === 0) return null;
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    const tMs = t.getTime();
    const rs = rangeStart.getTime();
    const re = rangeEnd.getTime();
    if (tMs < rs || tMs > re) return null;
    const pct = ((tMs - rs) / totalMs) * 100;
    return LABEL_W + (pct / 100) * chartWidth;
  }, [ranges.length, rangeStart, rangeEnd, totalMs, chartWidth]);

  if (section.type !== "project") return null;

  return (
    <div
      style={{
        margin: "0 16px 16px",
        borderRadius: 8,
        border: "1px solid var(--border-color)",
        background: "linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-primary) 100%)",
        overflow: "hidden",
        boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          background: "linear-gradient(90deg, #1e3a5f 0%, #243044 100%)",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#e8eef5",
              letterSpacing: "0.02em",
            }}
          >
            Critical path
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>
            {section.title} · Gantt view (dates & estimates)
          </div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#f87171" }}>
          {rangeEnd.getFullYear()}
        </div>
      </div>

      {ranges.length === 0 ? (
        <div
          style={{
            padding: "24px 16px",
            color: "var(--text-muted)",
            fontSize: 13,
            textAlign: "center",
          }}
        >
          Add tasks to <strong>{section.title}</strong> with start dates, due dates, or time
          estimates to see the timeline.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: LABEL_W + chartWidth, position: "relative" }}>
            {/* Timeline header */}
            <div style={{ display: "flex", borderBottom: "1px solid var(--border-color)" }}>
              <div
                style={{
                  width: LABEL_W,
                  flexShrink: 0,
                  background: "var(--bg-tertiary)",
                  borderRight: "1px solid var(--border-color)",
                }}
              />
              <div style={{ width: chartWidth, flexShrink: 0 }}>
                {/* Quarters */}
                <div style={{ display: "flex", height: 22, background: "#1a2744" }}>
                  {months.map((m, i) => {
                    const next = addMonths(m, 1);
                    const startClamped = Math.max(
                      m.getTime(),
                      rangeStart.getTime()
                    );
                    const endClamped = Math.min(next.getTime(), rangeEnd.getTime());
                    const w =
                      ((endClamped - startClamped) / totalMs) * 100;
                    const showQ =
                      i === 0 ||
                      formatQuarter(m) !== formatQuarter(months[i - 1]!);
                    return (
                      <div
                        key={`q-${m.getTime()}`}
                        style={{
                          width: `${w}%`,
                          borderRight: "1px solid rgba(255,255,255,0.08)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 10,
                          fontWeight: 700,
                          color: "rgba(255,255,255,0.85)",
                        }}
                      >
                        {showQ ? formatQuarter(m) : ""}
                      </div>
                    );
                  })}
                </div>
                {/* Months */}
                <div style={{ display: "flex", height: 26, background: "#243044" }}>
                  {months.map((m) => {
                    const next = addMonths(m, 1);
                    const startClamped = Math.max(
                      m.getTime(),
                      rangeStart.getTime()
                    );
                    const endClamped = Math.min(next.getTime(), rangeEnd.getTime());
                    const w =
                      ((endClamped - startClamped) / totalMs) * 100;
                    return (
                      <div
                        key={`m-${m.getTime()}`}
                        style={{
                          width: `${w}%`,
                          borderRight: "1px solid rgba(255,255,255,0.06)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 11,
                          fontWeight: 600,
                          color: "rgba(255,255,255,0.92)",
                        }}
                      >
                        {formatMonthShort(m)}
                      </div>
                    );
                  })}
                </div>
                {/* Week ticks */}
                <div
                  style={{
                    display: "flex",
                    height: 20,
                    background: "#1e293b",
                    position: "relative",
                  }}
                >
                  {Array.from({ length: Math.ceil(totalDays / 7) + 1 }).map(
                    (_, wi) => {
                      const t = addDays(rangeStart, wi * 7);
                      if (t.getTime() > rangeEnd.getTime()) return null;
                      const left = ((t.getTime() - rangeStart.getTime()) / totalMs) * 100;
                      return (
                        <div
                          key={wi}
                          style={{
                            position: "absolute",
                            left: `${left}%`,
                            top: 0,
                            bottom: 0,
                            width: 1,
                            background: "rgba(255,255,255,0.12)",
                          }}
                        />
                      );
                    }
                  )}
                  <span
                    style={{
                      position: "absolute",
                      right: 6,
                      top: 2,
                      fontSize: 10,
                      color: "rgba(255,255,255,0.45)",
                    }}
                  >
                    weeks
                  </span>
                </div>
              </div>
            </div>

            {/* Rows + chart */}
            <div style={{ position: "relative" }}>
              {ranges.map((r, row) => {
                const left = xPct(r.start);
                const w = Math.max(
                  0.4,
                  xPct(r.end) - xPct(r.start)
                );
                const treeFill = barFillForTask(r.task);
                const isCp = r.task.isCriticalPath;
                const barStyles = ganttBarButtonStyles({
                  treeFill,
                  completed: r.task.completed,
                  isCp,
                });
                return (
                  <div
                    key={r.task._id}
                    style={{
                      display: "flex",
                      minHeight: ROW_H,
                      borderBottom: "1px solid var(--border-subtle)",
                      background:
                        row % 2 === 0
                          ? "rgba(255,255,255,0.02)"
                          : "transparent",
                    }}
                  >
                    <div
                      style={{
                        width: LABEL_W,
                        flexShrink: 0,
                        padding: "6px 10px 6px 12px",
                        borderRight: "1px solid var(--border-color)",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 13,
                        fontWeight: 700,
                        color: r.task.completed
                          ? "var(--text-muted)"
                          : "var(--text-primary)",
                        textDecoration: r.task.completed ? "line-through" : "none",
                      }}
                    >
                      {hasChildrenSet.has(r.task._id) ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const id = r.task._id;
                            setChartCollapsedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(id)) next.delete(id);
                              else next.add(id);
                              return next;
                            });
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--text-muted)",
                            padding: 2,
                            flexShrink: 0,
                            display: "flex",
                            alignItems: "center",
                            cursor: "pointer",
                          }}
                          title={
                            chartCollapsedIds.has(r.task._id)
                              ? "Expand subtasks in chart"
                              : "Collapse subtasks in chart"
                          }
                        >
                          {chartCollapsedIds.has(r.task._id) ? (
                            <ChevronRight size={14} />
                          ) : (
                            <ChevronDown size={14} />
                          )}
                        </button>
                      ) : (
                        <span style={{ width: 18, flexShrink: 0 }} />
                      )}
                      <span
                        style={{
                          opacity: 0.45,
                          fontSize: 11,
                          width: 18,
                          flexShrink: 0,
                        }}
                      >
                        {row + 1}
                      </span>
                      <span
                        style={{
                          paddingLeft: r.task.depth * 10,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={r.task.title || "Untitled"}
                      >
                        {r.task.title || "Untitled"}
                      </span>
                    </div>
                    <div
                      style={{
                        width: chartWidth,
                        flexShrink: 0,
                        position: "relative",
                        height: ROW_H,
                      }}
                    >
                      {/* grid */}
                      {months.map((m) => {
                        const next = addMonths(m, 1);
                        const startClamped = Math.max(
                          m.getTime(),
                          rangeStart.getTime()
                        );
                        const endClamped = Math.min(
                          next.getTime(),
                          rangeEnd.getTime()
                        );
                        const leftM =
                          ((startClamped - rangeStart.getTime()) / totalMs) * 100;
                        const wM =
                          ((endClamped - startClamped) / totalMs) * 100;
                        return (
                          <div
                            key={`g-${m.getTime()}-${row}`}
                            style={{
                              position: "absolute",
                              top: 0,
                              bottom: 0,
                              left: `${leftM}%`,
                              width: `${wM}%`,
                              borderRight:
                                "1px solid rgba(255,255,255,0.05)",
                              pointerEvents: "none",
                            }}
                          />
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => onSelectTask(r.task._id)}
                        title={r.task.title}
                        style={{
                          position: "absolute",
                          top: "50%",
                          transform: "translateY(-50%)",
                          left: `${left}%`,
                          width: `${w}%`,
                          height: 22,
                          borderRadius: 4,
                          cursor: "pointer",
                          padding: 0,
                          overflow: "hidden",
                          ...barStyles,
                        }}
                      >
                        {r.task.completed && w >= 2.5 ? (
                          <span
                            style={{
                              position: "absolute",
                              right: 5,
                              top: "50%",
                              transform: "translateY(-50%)",
                              pointerEvents: "none",
                              display: "flex",
                              alignItems: "center",
                            }}
                            aria-hidden
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 12 12"
                              fill="none"
                            >
                              <path
                                d="M2.5 6l2.5 2.5L9.5 3.5"
                                stroke="#4ade80"
                                strokeWidth="1.75"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                        ) : null}
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Critical path connectors + end marker */}
              {criticalChain.length > 0 && (
                <svg
                  style={{
                    position: "absolute",
                    left: LABEL_W,
                    top: 0,
                    width: chartWidth,
                    height: ranges.length * ROW_H,
                    pointerEvents: "none",
                    overflow: "visible",
                  }}
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  {criticalChain.length > 1 &&
                    criticalChain.slice(0, -1).map((a, i) => {
                      const b = criticalChain[i + 1]!;
                      // No connector when tasks overlap in time (parallel work)
                      if (b.start.getTime() < a.end.getTime() - MS_DAY * 0.25) {
                        return null;
                      }
                      const ra = rowById.get(a.task._id) ?? 0;
                      const rb = rowById.get(b.task._id) ?? 0;
                      const x1 = xPct(a.end);
                      const x2 = xPct(b.start);
                      const y1 = yPct(ra);
                      const y2 = yPct(rb);
                      const ym = (y1 + y2) / 2;
                      const dPath = `M ${x1} ${y1} L ${x1} ${ym} L ${x2} ${ym} L ${x2} ${y2}`;
                      return (
                        <path
                          key={`${a.task._id}-${b.task._id}`}
                          d={dPath}
                          fill="none"
                          stroke="#f87171"
                          strokeWidth={0.85}
                          strokeDasharray="3 3"
                          opacity={0.95}
                        />
                      );
                    })}
                  {(() => {
                    const last = criticalChain[criticalChain.length - 1]!;
                    const lx = xPct(last.end);
                    const ly = yPct(rowById.get(last.task._id) ?? 0);
                    return (
                      <polygon
                        points={`${lx + 1.4},${ly} ${lx},${ly - 1.4} ${lx - 1.4},${ly} ${lx},${ly + 1.4}`}
                        fill="#f87171"
                      />
                    );
                  })()}
                </svg>
              )}
            </div>

            {todayLineLeftPx != null && (
              <div
                title="Today"
                style={{
                  position: "absolute",
                  left: todayLineLeftPx,
                  top: 0,
                  bottom: 0,
                  width: 2,
                  marginLeft: -1,
                  zIndex: 6,
                  pointerEvents: "none",
                  background:
                    "linear-gradient(180deg, rgba(96,165,250,0.35) 0%, rgba(59,130,246,0.95) 12%, rgba(59,130,246,0.95) 88%, rgba(96,165,250,0.35) 100%)",
                  boxShadow: "0 0 10px rgba(59,130,246,0.35)",
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
