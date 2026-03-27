"use client";

import React, { useMemo, useState } from "react";
import type { TaskItem } from "@/lib/types";
import { formatYmd, weightedRecurringDayCompletionPercent } from "@/lib/recurrence";
import { ChevronLeft, ChevronRight } from "./Icons";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function daysInMonth(year: number, monthZero: number): number {
  return new Date(year, monthZero + 1, 0).getDate();
}

interface Props {
  sectionTasks: TaskItem[];
}

export default function RecurringSectionCalendar({ sectionTasks }: Props) {
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const dim = daysInMonth(year, month);
  const todayYmd = formatYmd(new Date());
  const firstWeekday = new Date(year, month, 1).getDay();

  const cells = useMemo(() => {
    const list: { day: number; ymd: string; inMonth: boolean }[] = [];
    for (let i = 0; i < firstWeekday; i++) {
      list.push({ day: 0, ymd: "", inMonth: false });
    }
    for (let d = 1; d <= dim; d++) {
      const ymd = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      list.push({ day: d, ymd, inMonth: true });
    }
    while (list.length % 7 !== 0) {
      list.push({ day: 0, ymd: "", inMonth: false });
    }
    return list;
  }, [year, month, dim, firstWeekday]);

  const monthLabel = cursor.toLocaleString("en-US", { month: "long", year: "numeric" });

  return (
    <div
      style={{
        margin: "0 16px 10px 44px",
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px solid var(--border-color)",
        background: "var(--bg-secondary)",
        fontSize: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
          gap: 8,
        }}
      >
        <span
          style={{
            fontWeight: 600,
            color: "var(--text-secondary)",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Monthly completion
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            type="button"
            onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
            title="Previous month"
            style={{
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border-color)",
              borderRadius: 6,
              padding: 4,
              cursor: "pointer",
              display: "flex",
              color: "var(--text-muted)",
            }}
          >
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", minWidth: 140, textAlign: "center" }}>
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
            title="Next month"
            style={{
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border-color)",
              borderRadius: 6,
              padding: 4,
              cursor: "pointer",
              display: "flex",
              color: "var(--text-muted)",
            }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: 4,
        }}
      >
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "var(--text-muted)",
              textAlign: "center",
              padding: "2px 0 4px",
            }}
          >
            {label}
          </div>
        ))}
        {cells.map((cell, idx) => {
          if (!cell.inMonth) {
            return (
              <div
                key={`pad-${idx}`}
                style={{ minHeight: 44, borderRadius: 6, background: "transparent" }}
              />
            );
          }

          const isFuture = cell.ymd > todayYmd;
          const pct = isFuture ? null : weightedRecurringDayCompletionPercent(sectionTasks, cell.ymd);

          const fill =
            pct == null
              ? "transparent"
              : pct >= 99.5
                ? "rgba(34, 197, 94, 0.22)"
                : pct >= 50
                  ? "rgba(251, 191, 36, 0.18)"
                  : pct > 0
                    ? "rgba(248, 113, 113, 0.14)"
                    : "rgba(148, 163, 184, 0.1)";

          return (
            <div
              key={cell.ymd}
              title={cell.ymd}
              style={{
                minHeight: 44,
                borderRadius: 6,
                border: "1px solid var(--border-subtle)",
                background: isFuture ? "var(--bg-tertiary)" : fill,
                padding: "4px 4px 6px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-start",
                opacity: isFuture ? 0.45 : 1,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>
                {cell.day}
              </span>
              {!isFuture && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color:
                      pct == null
                        ? "var(--text-muted)"
                        : pct >= 99.5
                          ? "rgb(22, 163, 74)"
                          : "var(--text-secondary)",
                    marginTop: 2,
                    lineHeight: 1.2,
                  }}
                >
                  {pct == null ? "—" : `${Math.round(pct)}%`}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p
        style={{
          fontSize: 10,
          color: "var(--text-muted)",
          margin: "10px 0 0",
          lineHeight: 1.4,
        }}
      >
        Weighted by task weight; only habits with a start date on or before each day are counted.
      </p>
    </div>
  );
}
