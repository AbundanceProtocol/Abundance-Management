"use client";

import React, { useState, useEffect } from "react";
import { TaskItem, TimeUnit, TaskPriority } from "@/lib/types";
import { Clock, Calendar, Flag, Link, FileText, ArrowDownRight } from "./Icons";

interface Props {
  task: TaskItem;
  onUpdate: (task: Partial<TaskItem> & { _id: string }) => void;
  onClose: () => void;
}

export default function TaskDetailPanel({
  task,
  onUpdate,
  onClose,
}: Props) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [url, setUrl] = useState(task.url);
  const [timeEstimate, setTimeEstimate] = useState<string>(
    task.timeEstimate?.toString() || ""
  );
  const [timeUnit, setTimeUnit] = useState<TimeUnit>(task.timeUnit);
  const [priority, setPriority] = useState<TaskPriority>(task.priority ?? "medium");
  const [startDate, setStartDate] = useState(task.startDate || "");
  const [dueDate, setDueDate] = useState(task.dueDate || "");

  useEffect(() => {
    setTitle(task.title);
    setNotes(task.notes);
    setUrl(task.url);
    setTimeEstimate(task.timeEstimate?.toString() || "");
    setTimeUnit(task.timeUnit);
    setPriority(task.priority ?? "medium");
    setStartDate(task.startDate || "");
    setDueDate(task.dueDate || "");
  }, [task]);

  const save = (partial: Partial<TaskItem>) => {
    onUpdate({ _id: task._id, ...partial });
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: 380,
        height: "100vh",
        background: "var(--bg-secondary)",
        borderLeft: "1px solid var(--border-color)",
        display: "flex",
        flexDirection: "column",
        zIndex: 100,
        boxShadow: "-4px 0 20px rgba(0,0,0,0.3)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <div style={{ minWidth: 0, flex: 1, marginRight: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Task Details</div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginTop: 4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={title.trim() || "Untitled"}
          >
            {title.trim() || "Untitled"}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            fontSize: 18,
            padding: 4,
          }}
        >
          ✕
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Title */}
        <div>
          <label
            style={{
              display: "block",
              fontSize: 12,
              color: "var(--text-secondary)",
              marginBottom: 6,
            }}
          >
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              const next = title.trim();
              if (next !== (task.title || "").trim()) {
                save({ title: next });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            placeholder="Task name..."
            style={{
              width: "100%",
              fontSize: 15,
              fontWeight: 600,
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid var(--border-color)",
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Time Estimate */}
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
            <Clock size={14} /> Time Estimate
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              value={timeEstimate}
              onChange={(e) => setTimeEstimate(e.target.value)}
              onBlur={() =>
                save({
                  timeEstimate: timeEstimate ? parseInt(timeEstimate) : null,
                })
              }
              placeholder="0"
              style={{ width: 80 }}
              min={0}
            />
            <select
              value={timeUnit}
              onChange={(e) => {
                const unit = e.target.value as TimeUnit;
                setTimeUnit(unit);
                save({ timeUnit: unit });
              }}
              style={{ width: 100 }}
            >
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
              <option value="days">Days</option>
            </select>
          </div>
        </div>

        {/* Priority */}
        <div>
          <label
            style={{
              display: "block",
              fontSize: 12,
              color: "var(--text-secondary)",
              marginBottom: 6,
            }}
          >
            Priority
          </label>
          <select
            value={priority}
            onChange={(e) => {
              const p = e.target.value as TaskPriority;
              setPriority(p);
              save({ priority: p });
            }}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 6 }}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        {/* Start Date */}
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
            <Calendar size={14} /> Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              save({ startDate: e.target.value || null });
            }}
            style={{ width: "100%" }}
          />
        </div>

        {/* Due Date */}
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
            <Calendar size={14} /> Due Date
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => {
              setDueDate(e.target.value);
              save({ dueDate: e.target.value || null });
            }}
            style={{ width: "100%" }}
          />
        </div>

        {/* URL */}
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
            <Link size={14} /> URL
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => save({ url })}
            placeholder="https://..."
            style={{ width: "100%" }}
          />
        </div>

        {/* Critical Path */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 0",
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
            <Flag size={14} className={task.isCriticalPath ? "text-amber-400" : ""} />
            Critical Path
          </label>
          <button
            type="button"
            onClick={() => save({ isCriticalPath: !task.isCriticalPath })}
            style={{
              width: 36,
              height: 20,
              borderRadius: 10,
              background: task.isCriticalPath ? "var(--critical-path)" : "var(--bg-tertiary)",
              border: "1px solid var(--border-color)",
              position: "relative",
              transition: "background 0.2s",
              padding: 0,
              cursor: "pointer",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: task.isCriticalPath ? 18 : 2,
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: "white",
                transition: "left 0.2s",
              }}
            />
          </button>
        </div>

        {/* Sequential */}
        <div style={{ padding: "8px 0" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
              <ArrowDownRight size={14} />
              Sequential (children in order)
            </label>
            <button
              type="button"
              onClick={() => save({ isSequential: !task.isSequential })}
              style={{
                width: 36,
                height: 20,
                borderRadius: 10,
                background: task.isSequential ? "var(--accent-blue)" : "var(--bg-tertiary)",
                border: "1px solid var(--border-color)",
                position: "relative",
                transition: "background 0.2s",
                padding: 0,
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  left: task.isSequential ? 18 : 2,
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: "white",
                  transition: "left 0.2s",
                }}
              />
            </button>
          </div>
          {task.parentId === null && (
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "8px 0 0", lineHeight: 1.4 }}>
              For the <strong>section’s</strong> top-level list order, use the{" "}
              <strong>Sequential</strong> control in the section header (not this toggle).
            </p>
          )}
        </div>

        {/* Notes */}
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
            <FileText size={14} /> Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => save({ notes })}
            rows={6}
            placeholder="Add notes..."
            style={{
              width: "100%",
              resize: "vertical",
              minHeight: 100,
              fontFamily: "inherit",
              lineHeight: 1.5,
            }}
          />
        </div>
      </div>
    </div>
  );
}
