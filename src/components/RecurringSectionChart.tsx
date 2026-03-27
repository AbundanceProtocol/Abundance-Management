"use client";

import React, { useMemo } from "react";
import type { RecurringChartBucket, RecurringChartGranularity } from "@/lib/recurringChartStats";

interface Props {
  buckets: RecurringChartBucket[];
  granularity: RecurringChartGranularity;
}

const GRAN_LABEL: Record<RecurringChartGranularity, string> = {
  daily: "Last 30 days (rolling)",
  monthly: "Last 12 months",
  yearly: "Last 5 years",
  all: "All time (sum of daily weights)",
};

export default function RecurringSectionChart({ buckets, granularity }: Props) {
  const maxVal = useMemo(() => {
    let m = 1;
    for (const b of buckets) {
      m = Math.max(m, b.assigned, b.completed);
    }
    return m;
  }, [buckets]);

  const n = Math.max(1, buckets.length);
  const svgW = Math.max(
    260,
    n * (granularity === "daily" ? 14 : granularity === "monthly" ? 28 : 42)
  );
  const svgH = 200;
  const padL = 32;
  const padR = 8;
  const padT = 12;
  const padB = 30;
  const chartW = svgW - padL - padR;
  const chartH = svgH - padT - padB;
  const groupW = chartW / n;
  const assignedPoints = buckets
    .map((b, i) => {
      const x = padL + i * groupW + groupW / 2;
      const y = padT + chartH - (b.assigned / maxVal) * chartH;
      return `${x},${y}`;
    })
    .join(" ");
  const completedPoints = buckets
    .map((b, i) => {
      const x = padL + i * groupW + groupW / 2;
      const y = padT + chartH - (b.completed / maxVal) * chartH;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div
      style={{
        margin: "0 8px 10px 8px",
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px solid var(--border-color)",
        background: "var(--bg-secondary)",
        fontSize: 12,
      }}
    >
      <div
        style={{
          fontWeight: 600,
          color: "var(--text-secondary)",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          marginBottom: 4,
        }}
      >
        Weight totals
      </div>
      <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "0 0 10px", lineHeight: 1.4 }}>
        {GRAN_LABEL[granularity]} — assigned (expected) vs completed per period.
      </p>

      <div style={{ overflowX: "auto", width: "100%" }}>
        <svg
          width={svgW}
          height={svgH}
          style={{ display: "block", minWidth: "100%" }}
          aria-label="Assigned vs completed weight chart"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = padT + chartH * (1 - t);
            const val = Math.round(maxVal * t);
            return (
              <g key={t}>
                <line
                  x1={padL}
                  y1={y}
                  x2={padL + chartW}
                  y2={y}
                  stroke="var(--border-subtle)"
                  strokeWidth={1}
                  strokeDasharray={t === 1 ? "none" : "3 4"}
                  opacity={0.85}
                />
                <text
                  x={padL - 6}
                  y={y + 4}
                  textAnchor="end"
                  fontSize={9}
                  fill="var(--text-muted)"
                >
                  {val}
                </text>
              </g>
            );
          })}

          <polyline
            points={assignedPoints}
            fill="none"
            stroke="rgba(100, 116, 139, 0.98)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <polyline
            points={completedPoints}
            fill="none"
            stroke="rgba(34, 197, 94, 0.95)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {buckets.map((b, i) => {
            const gx = padL + i * groupW + groupW / 2;
            const yAssigned = padT + chartH - (b.assigned / maxVal) * chartH;
            const yCompleted = padT + chartH - (b.completed / maxVal) * chartH;
            return (
              <g key={b.sortKey}>
                <circle cx={gx} cy={yAssigned} r={2.4} fill="rgba(100, 116, 139, 0.98)">
                  <title>{`${b.label} overall: ${b.assigned}`}</title>
                </circle>
                <circle cx={gx} cy={yCompleted} r={2.4} fill="rgba(34, 197, 94, 0.95)">
                  <title>{`${b.label} completed: ${b.completed}`}</title>
                </circle>
                {(granularity !== "daily" || i % 5 === 0 || n <= 12) && (
                  <text
                    x={gx}
                    y={svgH - 8}
                    textAnchor="middle"
                    fontSize={granularity === "daily" ? 7 : 9}
                    fill="var(--text-muted)"
                  >
                    {b.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          marginTop: 8,
          fontSize: 10,
          color: "var(--text-muted)",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: "rgba(100, 116, 139, 0.98)",
            }}
          />
          Overall weight
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: "rgba(34, 197, 94, 0.85)",
            }}
          />
          Completed weight
        </span>
      </div>
    </div>
  );
}
