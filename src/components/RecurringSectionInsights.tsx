"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { TaskItem } from "@/lib/types";
import {
  buildRecurringChartSeries,
  type RecurringChartGranularity,
} from "@/lib/recurringChartStats";
import RecurringSectionCalendar from "./RecurringSectionCalendar";
import RecurringSectionChart from "./RecurringSectionChart";

export type RecurringInsightsViewMode = "chart" | "calendar" | "both" | "hidden";

interface Props {
  sectionId: string;
  sectionTasks: TaskItem[];
}

const VIEW_KEY = (id: string) => `recurringSectionInsights.view.${id}`;
const GRAN_KEY = (id: string) => `recurringSectionInsights.granularity.${id}`;

function readStoredView(id: string): RecurringInsightsViewMode | null {
  try {
    const v = localStorage.getItem(VIEW_KEY(id));
    if (v === "chart" || v === "calendar" || v === "both" || v === "hidden") return v;
  } catch {
    /* ignore */
  }
  return null;
}

function readStoredGranularity(id: string): RecurringChartGranularity | null {
  try {
    const g = localStorage.getItem(GRAN_KEY(id));
    if (g === "daily" || g === "monthly" || g === "yearly" || g === "all") return g;
  } catch {
    /* ignore */
  }
  return null;
}

export default function RecurringSectionInsights({ sectionId, sectionTasks }: Props) {
  const [viewMode, setViewMode] = useState<RecurringInsightsViewMode>("both");
  const [granularity, setGranularity] = useState<RecurringChartGranularity>("daily");

  useEffect(() => {
    const v = readStoredView(sectionId);
    if (v) setViewMode(v);
    const g = readStoredGranularity(sectionId);
    if (g) setGranularity(g);
  }, [sectionId]);

  const persistView = (next: RecurringInsightsViewMode) => {
    setViewMode(next);
    try {
      localStorage.setItem(VIEW_KEY(sectionId), next);
    } catch {
      /* ignore */
    }
  };

  const persistGranularity = (next: RecurringChartGranularity) => {
    setGranularity(next);
    try {
      localStorage.setItem(GRAN_KEY(sectionId), next);
    } catch {
      /* ignore */
    }
  };

  const chartBuckets = useMemo(
    () => buildRecurringChartSeries(sectionTasks, granularity),
    [sectionTasks, granularity]
  );

  const showChart = viewMode === "chart" || viewMode === "both";
  const showCalendar = viewMode === "calendar" || viewMode === "both";

  return (
    <div style={{ marginBottom: 0 }}>
      <div
        style={{
          margin: "0 16px 8px 44px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 10,
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid var(--border-color)",
          background: "var(--bg-tertiary)",
          fontSize: 12,
        }}
      >
        <span style={{ fontWeight: 600, color: "var(--text-secondary)", marginRight: 4 }}>
          Stats
        </span>
        <label style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-muted)" }}>
          View
          <select
            value={viewMode}
            onChange={(e) => persistView(e.target.value as RecurringInsightsViewMode)}
            style={{
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid var(--border-color)",
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              fontSize: 12,
            }}
          >
            <option value="both">Chart + calendar</option>
            <option value="chart">Chart only</option>
            <option value="calendar">Calendar only</option>
            <option value="hidden">Hidden</option>
          </select>
        </label>
        {showChart && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-muted)" }}>
            Chart
            <select
              value={granularity}
              onChange={(e) => persistGranularity(e.target.value as RecurringChartGranularity)}
              style={{
                padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid var(--border-color)",
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
                fontSize: 12,
              }}
            >
              <option value="daily">Daily</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="all">All</option>
            </select>
          </label>
        )}
      </div>

      {showChart && (
        <RecurringSectionChart buckets={chartBuckets} granularity={granularity} />
      )}
      {showCalendar && <RecurringSectionCalendar sectionTasks={sectionTasks} />}
    </div>
  );
}
