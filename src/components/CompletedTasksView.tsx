"use client";

import React, { useMemo } from "react";
import { Section, TaskItem, SectionType } from "@/lib/types";
import { flattenTasksTree } from "@/lib/timelineUtils";
import { FileText } from "./Icons";

function sectionGroupLabel(type: SectionType): string {
  switch (type) {
    case "project":
      return "Main";
    case "recurring":
      return "Recurring";
    case "todo":
      return "To do list";
    default:
      return type;
  }
}

interface Props {
  sections: Section[];
  tasks: TaskItem[];
  onUpdateTask: (task: Partial<TaskItem> & { _id: string }) => void;
  onSelectTask: (id: string | null) => void;
}

export default function CompletedTasksView({
  sections,
  tasks,
  onUpdateTask,
  onSelectTask,
}: Props) {
  const orderedSections = useMemo(
    () => [...sections].sort((a, b) => a.order - b.order),
    [sections]
  );

  const bySection = useMemo(() => {
    const map = new Map<
      string,
      {
        completed: TaskItem[];
        history: { task: TaskItem; date: string }[];
      }
    >();
    for (const s of sections) {
      map.set(s._id, { completed: [], history: [] });
    }
    for (const t of tasks) {
      const entry = map.get(t.sectionId);
      if (!entry) continue;
      if (t.completed) entry.completed.push(t);
      for (const d of t.completionHistory ?? []) {
        if (d?.trim()) entry.history.push({ task: t, date: d.trim() });
      }
    }
    for (const [, v] of map) {
      v.history.sort((a, b) => b.date.localeCompare(a.date));
    }
    return map;
  }, [tasks, sections]);

  return (
    <div style={{ padding: "8px 0 24px" }}>
      {orderedSections.map((section) => {
        const data = bySection.get(section._id);
        if (!data) return null;
        const flat = flattenTasksTree(
          tasks.filter((t) => t.sectionId === section._id),
          "manual"
        );
        const completedInOrder = flat.filter((t) => t.completed);
        const hasHistory = data.history.length > 0;
        if (completedInOrder.length === 0 && !hasHistory) {
          return (
            <div key={section._id} style={{ marginBottom: 24 }}>
              <h2
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  margin: "0 24px 8px",
                  letterSpacing: "0.02em",
                }}
              >
                {sectionGroupLabel(section.type)}
              </h2>
              <p
                style={{
                  margin: "0 24px",
                  fontSize: 13,
                  color: "var(--text-muted)",
                  fontStyle: "italic",
                }}
              >
                No completed items yet.
              </p>
            </div>
          );
        }

        return (
          <div key={section._id} style={{ marginBottom: 28 }}>
            <h2
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-secondary)",
                margin: "0 24px 12px",
                letterSpacing: "0.02em",
              }}
            >
              {sectionGroupLabel(section.type)}
            </h2>

            {completedInOrder.length > 0 && (
              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: "0 16px 0 24px",
                }}
              >
                {completedInOrder.map((t) => (
                  <li
                    key={t._id}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 6,
                      marginBottom: 4,
                      paddingLeft: 12 + t.depth * 20,
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--border-color)",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                    }}
                  >
                    <button
                      type="button"
                      title="Mark incomplete"
                      onClick={() =>
                        onUpdateTask({ _id: t._id, completed: false })
                      }
                      style={{
                        width: 20,
                        height: 20,
                        marginTop: 2,
                        borderRadius: "50%",
                        border: "2px solid var(--accent-green)",
                        background: "var(--accent-green)",
                        flexShrink: 0,
                        cursor: "pointer",
                        padding: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path
                          d="M2 5l2.5 2.5L8 3"
                          stroke="white"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectTask(t._id)}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        textAlign: "left",
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        color: "var(--text-primary)",
                        fontSize: 14,
                        fontWeight: 600,
                        textDecoration: "line-through",
                      }}
                    >
                      {t.title.trim() || "Untitled"}
                    </button>
                    {t.linkedPageId && (
                      <button
                        type="button"
                        title="Open linked page"
                        aria-label="Open linked page"
                        onClick={() => {
                          const pageId = t.linkedPageId;
                          if (!pageId) return;
                          window.location.href = `/pages?pageId=${encodeURIComponent(
                            pageId
                          )}&taskId=${encodeURIComponent(t._id)}`;
                        }}
                        style={{
                          flexShrink: 0,
                          marginLeft: 8,
                          width: 26,
                          height: 26,
                          borderRadius: 6,
                          padding: 0,
                          border: "1px solid rgba(96, 165, 250, 0.45)",
                          background: "rgba(59, 130, 246, 0.18)",
                          color: "var(--accent-blue)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          alignSelf: "center",
                        }}
                      >
                        <FileText size={14} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {hasHistory && section.type === "recurring" && (
              <div style={{ marginTop: completedInOrder.length ? 16 : 0 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    margin: "0 24px 8px",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Recurring completions
                </div>
                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: "0 16px 0 24px",
                  }}
                >
                  {data.history.map((h, idx) => (
                    <li
                      key={`${h.task._id}-${h.date}-${idx}`}
                      style={{
                        padding: "6px 12px",
                        fontSize: 13,
                        color: "var(--text-muted)",
                        paddingLeft: 12 + h.task.depth * 20,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectTask(h.task._id)}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                          color: "var(--accent-blue)",
                          fontSize: 13,
                        }}
                      >
                        {h.task.title.trim() || "Untitled"}
                      </button>
                      {h.task.linkedPageId && (
                        <button
                          type="button"
                          title="Open linked page"
                          aria-label="Open linked page"
                          onClick={() => {
                            const pageId = h.task.linkedPageId;
                            if (!pageId) return;
                            window.location.href = `/pages?pageId=${encodeURIComponent(
                              pageId
                            )}&taskId=${encodeURIComponent(h.task._id)}`;
                          }}
                          style={{
                            flexShrink: 0,
                            marginLeft: 8,
                            width: 26,
                            height: 26,
                            borderRadius: 6,
                            padding: 0,
                            border: "1px solid rgba(96, 165, 250, 0.45)",
                            background: "rgba(59, 130, 246, 0.18)",
                            color: "var(--accent-blue)",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            verticalAlign: "middle",
                          }}
                        >
                          <FileText size={14} />
                        </button>
                      )}
                      <span style={{ marginLeft: 8, opacity: 0.9 }}>
                        — {h.date}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
