"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Section, TaskItem, TopLevelSort } from "@/lib/types";
import { buildVisibleTaskTree } from "@/lib/timelineUtils";
import { ChevronRight, ChevronDown, Plus, Comment, ArrowDownRight } from "./Icons";
import TaskRow from "./TaskRow";
import NestDropZone from "./NestDropZone";

interface Props {
  section: Section;
  tasks: TaskItem[];
  onUpdateSection: (section: Partial<Section> & { _id: string }) => void;
  onUpdateTask: (task: Partial<TaskItem> & { _id: string }) => void;
  onDeleteTask: (id: string) => void;
  onCreateTask: (sectionId: string, parentId: string | null, depth: number) => void;
  onCreateTaskAfter: (afterTask: TaskItem) => void | Promise<void>;
  selectedTaskId: string | null;
  onSelectTask: (id: string | null) => void;
}

export default function SectionView({
  section,
  tasks,
  onUpdateSection,
  onUpdateTask,
  onDeleteTask,
  onCreateTask,
  onCreateTaskAfter,
  selectedTaskId,
  onSelectTask,
}: Props) {
  const sectionTasks = useMemo(
    () => tasks.filter((t) => t.sectionId === section._id),
    [tasks, section._id]
  );

  const collapsedIds = useMemo(
    () => new Set(sectionTasks.filter((t) => t.collapsed).map((t) => t._id)),
    [sectionTasks]
  );

  const flatTasks = useMemo(
    () =>
      buildVisibleTaskTree(
        sectionTasks,
        null,
        collapsedIds,
        section.topLevelSort ?? "manual"
      ),
    [sectionTasks, collapsedIds, section.topLevelSort]
  );

  const taskIds = useMemo(() => flatTasks.map((t) => t._id), [flatTasks]);

  const childCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of sectionTasks) {
      if (t.parentId) {
        map[t.parentId] = (map[t.parentId] || 0) + 1;
      }
    }
    return map;
  }, [sectionTasks]);

  const toggleCollapse = (taskId: string) => {
    const t = sectionTasks.find((t) => t._id === taskId);
    if (t) {
      onUpdateTask({ _id: taskId, collapsed: !t.collapsed });
    }
  };

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(section.title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitleDraft(section.title);
  }, [section.title]);

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  const commitTitle = () => {
    const next = titleDraft.trim();
    if (next && next !== section.title) {
      onUpdateSection({ _id: section._id, title: next });
    } else {
      setTitleDraft(section.title);
    }
    setEditingTitle(false);
  };

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Section Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "10px 16px",
          cursor: "pointer",
          userSelect: "none",
          gap: 8,
        }}
        className="section-header"
      >
        <button
          type="button"
          onClick={() =>
            onUpdateSection({
              _id: section._id,
              collapsed: !section.collapsed,
            })
          }
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            padding: 0,
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
          }}
        >
          {section.collapsed ? (
            <ChevronRight size={16} />
          ) : (
            <ChevronDown size={16} />
          )}
        </button>

        {editingTitle ? (
          <input
            ref={titleInputRef}
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTitle();
              if (e.key === "Escape") {
                setTitleDraft(section.title);
                setEditingTitle(false);
              }
            }}
            style={{
              fontWeight: 600,
              fontSize: 15,
              color: "var(--text-primary)",
              background: "var(--bg-secondary)",
              border: "1px solid var(--accent-blue)",
              borderRadius: 4,
              padding: "2px 6px",
              minWidth: 120,
              flex: 1,
              maxWidth: 320,
            }}
          />
        ) : (
          <button
            type="button"
            onDoubleClick={() => setEditingTitle(true)}
            style={{
              fontWeight: 600,
              fontSize: 15,
              color: "var(--text-primary)",
              background: "none",
              border: "none",
              padding: "2px 4px",
              borderRadius: 4,
              cursor: "text",
              textAlign: "left",
            }}
            title="Double-click to rename section"
          >
            {section.title}
          </button>
        )}

        <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 4 }}>
          {sectionTasks.filter((t) => t.parentId === null).length}
        </span>

        <>
        <button
          type="button"
          onClick={() =>
            onUpdateSection({
              _id: section._id,
              isSequential: !section.isSequential,
            })
          }
          title={
            section.isSequential
              ? "Top-level tasks are sequential (on)"
              : "Top-level tasks are sequential (off)"
          }
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            marginLeft: 6,
            padding: "4px 8px",
            borderRadius: 6,
            border: "1px solid var(--border-color)",
            background: section.isSequential ? "rgba(59, 130, 246, 0.15)" : "var(--bg-tertiary)",
            color: section.isSequential ? "var(--accent-blue)" : "var(--text-muted)",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          <ArrowDownRight size={12} />
          Sequential
        </button>

        <select
          value={section.topLevelSort ?? "manual"}
          onChange={(e) =>
            onUpdateSection({
              _id: section._id,
              topLevelSort: e.target.value as TopLevelSort,
            })
          }
          title="Sort top-level tasks (nested subtasks keep manual order)"
          style={{
            fontSize: 11,
            marginLeft: 6,
            padding: "4px 8px",
            borderRadius: 6,
            border: "1px solid var(--border-color)",
            background: "var(--bg-tertiary)",
            color: "var(--text-secondary)",
            cursor: "pointer",
            maxWidth: 148,
          }}
        >
          <option value="manual">Order (manual)</option>
          <option value="priority">Priority</option>
          <option value="startDate">Start date</option>
        </select>
        </>

        <div style={{ flex: 1 }} />

        <button
          type="button"
          onClick={() => onCreateTask(section._id, null, 0)}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            padding: 4,
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            opacity: 0.6,
            transition: "opacity 0.15s",
          }}
          className="section-add-btn"
          title="Add task"
        >
          <Plus size={16} />
        </button>

        <button
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            padding: 4,
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            opacity: 0.6,
          }}
        >
          <Comment size={16} />
        </button>
      </div>

      {/* Task List */}
      {!section.collapsed && (
        <div style={{ paddingLeft: 8 }}>
          <SortableContext
            items={taskIds}
            strategy={verticalListSortingStrategy}
          >
            {flatTasks.map((task) => (
              <React.Fragment key={task._id}>
                <TaskRow
                  task={task}
                  childCount={childCountMap[task._id] || 0}
                  onUpdate={onUpdateTask}
                  onDelete={onDeleteTask}
                  onAddChild={() =>
                    onCreateTask(section._id, task._id, task.depth + 1)
                  }
                  onCreateSiblingAfter={() => onCreateTaskAfter(task)}
                  onToggleCollapse={() => toggleCollapse(task._id)}
                  onSelect={() => onSelectTask(task._id)}
                  isSelected={selectedTaskId === task._id}
                  sectionSequentialForRoot={
                    task.parentId === null ? section.isSequential : undefined
                  }
                />
                <NestDropZone taskId={task._id} />
              </React.Fragment>
            ))}
          </SortableContext>

          {flatTasks.length === 0 && (
            <div
              style={{
                padding: "8px 16px 8px 44px",
                color: "var(--text-muted)",
                fontSize: 13,
                fontStyle: "italic",
              }}
            >
              No tasks yet.{" "}
              <button
                type="button"
                onClick={() => onCreateTask(section._id, null, 0)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--accent-blue)",
                  fontSize: 13,
                  padding: 0,
                  textDecoration: "underline",
                }}
              >
                Add one
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
