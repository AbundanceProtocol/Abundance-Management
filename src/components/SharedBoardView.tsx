"use client";

import React, { useState } from "react";
import type { Section, TaskItem } from "@/lib/types";

interface Props {
  viewName: string;
  sections: Section[];
  tasks: TaskItem[];
}

function buildTree(tasks: TaskItem[], parentId: string | null, sectionId: string): TaskItem[] {
  return tasks
    .filter((t) => t.sectionId === sectionId && t.parentId === parentId)
    .sort((a, b) => a.order - b.order || a._id.localeCompare(b._id));
}

function TaskTree({
  tasks,
  parentId,
  sectionId,
  depth,
}: {
  tasks: TaskItem[];
  parentId: string | null;
  sectionId: string;
  depth: number;
}) {
  const children = buildTree(tasks, parentId, sectionId);
  if (children.length === 0) return null;

  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {children.map((task) => (
        <TaskNode key={task._id} task={task} tasks={tasks} sectionId={sectionId} depth={depth} />
      ))}
    </ul>
  );
}

function TaskNode({
  task,
  tasks,
  sectionId,
  depth,
}: {
  task: TaskItem;
  tasks: TaskItem[];
  sectionId: string;
  depth: number;
}) {
  const [collapsed, setCollapsed] = useState(task.collapsed);
  const hasChildren = tasks.some((t) => t.parentId === task._id);
  const indent = depth * 20;

  return (
    <li>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          padding: "8px 16px 8px",
          paddingLeft: 16 + indent,
          borderBottom: "1px solid var(--border-color)",
          gap: 10,
          opacity: task.completed ? 0.45 : 1,
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: "var(--text-muted)",
              fontSize: 10,
              flexShrink: 0,
              marginTop: 3,
              width: 14,
            }}
          >
            {collapsed ? "▶" : "▼"}
          </button>
        ) : (
          <span style={{ width: 14, flexShrink: 0 }} />
        )}
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: task.completed ? "var(--text-muted)" : "var(--accent-blue)",
            flexShrink: 0,
            marginTop: 5,
          }}
        />
        <span
          style={{
            flex: 1,
            fontSize: 14,
            color: "var(--text-primary)",
            textDecoration: task.completed ? "line-through" : "none",
            lineHeight: 1.4,
            wordBreak: "break-word",
          }}
        >
          {task.title || "(Untitled)"}
        </span>
        {task.dueDate && (
          <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0, marginTop: 2 }}>
            {task.dueDate}
          </span>
        )}
      </div>
      {!collapsed && hasChildren && (
        <TaskTree tasks={tasks} parentId={task._id} sectionId={sectionId} depth={depth + 1} />
      )}
    </li>
  );
}

export function SharedBoardView({ viewName, sections, tasks }: Props) {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () => new Set(sections.filter((s) => s.collapsed).map((s) => s._id))
  );

  const toggleSection = (id: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sorted = [...sections].sort((a, b) => a.order - b.order);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
      }}
    >
      {/* View-only banner */}
      <div
        style={{
          padding: "10px 20px",
          background: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border-color)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
          {viewName}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text-muted)",
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border-color)",
            borderRadius: 4,
            padding: "2px 8px",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          View only
        </span>
      </div>

      {/* Sections */}
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "16px 0" }}>
        {sorted.map((section) => {
          const isCollapsed = collapsedSections.has(section._id);
          const sectionTasks = tasks.filter((t) => t.sectionId === section._id);
          const rootCount = sectionTasks.filter((t) => t.parentId === null).length;

          return (
            <div
              key={section._id}
              style={{
                marginBottom: 16,
                border: "1px solid var(--border-color)",
                borderRadius: 8,
                overflow: "hidden",
                background: "var(--bg-primary)",
              }}
            >
              {/* Section header */}
              <button
                type="button"
                onClick={() => toggleSection(section._id)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 16px",
                  background: "var(--bg-secondary)",
                  border: "none",
                  borderBottom: isCollapsed ? "none" : "1px solid var(--border-color)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                  {isCollapsed ? "▶" : "▼"}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  {section.title || "Untitled Section"}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {rootCount} {rootCount === 1 ? "task" : "tasks"}
                </span>
              </button>

              {!isCollapsed && (
                <TaskTree
                  tasks={sectionTasks}
                  parentId={null}
                  sectionId={section._id}
                  depth={0}
                />
              )}
            </div>
          );
        })}

        {sorted.length === 0 && (
          <p style={{ textAlign: "center", color: "var(--text-muted)", padding: 32 }}>
            No sections to display.
          </p>
        )}
      </div>
    </div>
  );
}
