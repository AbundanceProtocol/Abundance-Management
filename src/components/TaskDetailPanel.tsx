"use client";

import React, { useState, useEffect } from "react";
import { TaskItem, TimeUnit, TaskPriority, Section, RepeatFrequency } from "@/lib/types";
import { Clock, Calendar, Flag, Link, FileText, ArrowDownRight } from "./Icons";

interface Props {
  task: TaskItem;
  /** Section for the task (recurrence UI only in recurring section). */
  section: Section | null;
  onUpdate: (task: Partial<TaskItem> & { _id: string }) => void;
  onClose: () => void;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function TaskDetailPanel({
  task,
  section,
  onUpdate,
  onClose,
}: Props) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [urls, setUrls] = useState<string[]>(() => [...(task.urls ?? [])]);
  const [timeEstimate, setTimeEstimate] = useState<string>(
    task.timeEstimate?.toString() || ""
  );
  const [timeUnit, setTimeUnit] = useState<TimeUnit>(task.timeUnit);
  const [priority, setPriority] = useState<TaskPriority>(task.priority ?? "medium");
  const [startDate, setStartDate] = useState(task.startDate || "");
  const [dueDate, setDueDate] = useState(task.dueDate || "");
  const [dueTime, setDueTime] = useState(() =>
    task.dueTime?.trim() ? task.dueTime : ""
  );
  const [repeatFrequency, setRepeatFrequency] = useState<RepeatFrequency>(
    task.repeatFrequency ?? "none"
  );
  const [repeatWeekdays, setRepeatWeekdays] = useState<number[]>(
    () => task.repeatWeekdays?.length ? [...task.repeatWeekdays] : [new Date().getDay()]
  );

  useEffect(() => {
    setTitle(task.title);
    setNotes(task.notes);
    setUrls([...(task.urls ?? [])]);
    setTimeEstimate(task.timeEstimate?.toString() || "");
    setTimeUnit(task.timeUnit);
    setPriority(task.priority ?? "medium");
    setStartDate(task.startDate || "");
    setDueDate(task.dueDate || "");
    setRepeatFrequency(task.repeatFrequency ?? "none");
    setRepeatWeekdays(
      task.repeatWeekdays?.length ? [...task.repeatWeekdays] : [new Date().getDay()]
    );
  }, [task]);

  const save = (partial: Partial<TaskItem>) => {
    onUpdate({ _id: task._id, ...partial });
  };

  const commitUrls = () => {
    const cleaned = urls.map((u) => u.trim()).filter(Boolean);
    const prev = (task.urls ?? []).map((u) => u.trim()).filter(Boolean);
    const same =
      cleaned.length === prev.length &&
      cleaned.every((u, i) => u === prev[i]);
    if (!same) save({ urls: cleaned });
    setUrls(cleaned);
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
              const v = e.target.value;
              setDueDate(v);
              if (!v) {
                if (section?.type === "todo") {
                  setDueTime("");
                  save({ dueDate: null, dueTime: null });
                } else {
                  save({ dueDate: null });
                }
              } else {
                save({ dueDate: v });
              }
            }}
            style={{ width: "100%" }}
          />
          {section?.type === "todo" && (
            <div style={{ marginTop: 10 }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  marginBottom: 6,
                }}
              >
                <Clock size={14} /> Due time
              </label>
              <input
                type="time"
                value={dueTime}
                disabled={!dueDate.trim()}
                onChange={(e) => {
                  const v = e.target.value;
                  setDueTime(v);
                  save({ dueTime: v.trim() ? v : null });
                }}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 6,
                  opacity: dueDate.trim() ? 1 : 0.5,
                }}
              />
              {!dueDate.trim() && (
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "6px 0 0", lineHeight: 1.4 }}>
                  Set a due date to enable due time.
                </p>
              )}
            </div>
          )}
          {section?.type === "recurring" && repeatFrequency === "monthly" && (
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "8px 0 0", lineHeight: 1.4 }}>
              Monthly repeats use the <strong>day of month</strong> from this due date.
            </p>
          )}
        </div>

        {section?.type === "recurring" && (
          <div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              <Clock size={14} /> Scheduled time
            </label>
            <input
              type="time"
              value={dueTime}
              onChange={(e) => {
                const v = e.target.value;
                setDueTime(v);
                save({ dueTime: v.trim() ? v : null });
              }}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 6,
              }}
            />
            <p
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                margin: "6px 0 0",
                lineHeight: 1.4,
              }}
            >
              When this runs on each occurrence. Does not require a due date.
            </p>
          </div>
        )}

        {/* Recurrence (recurring section only) */}
        {section?.type === "recurring" && (
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              Repeats
            </label>
            <select
              value={repeatFrequency}
              onChange={(e) => {
                const v = e.target.value as RepeatFrequency;
                setRepeatFrequency(v);
                if (v === "none") {
                  save({ repeatFrequency: "none", repeatWeekdays: [] });
                } else if (v === "weekly") {
                  const next =
                    repeatWeekdays.length > 0
                      ? repeatWeekdays
                      : [new Date().getDay()];
                  setRepeatWeekdays(next);
                  save({ repeatFrequency: v, repeatWeekdays: next });
                } else {
                  save({ repeatFrequency: v, repeatWeekdays: [] });
                }
              }}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 6 }}
            >
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            {repeatFrequency === "weekly" && (
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {WEEKDAY_LABELS.map((label, day) => {
                  const on = repeatWeekdays.includes(day);
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        const next = on
                          ? repeatWeekdays.filter((d) => d !== day)
                          : [...repeatWeekdays, day].sort((a, b) => a - b);
                        setRepeatWeekdays(next);
                        save({
                          repeatFrequency: "weekly",
                          repeatWeekdays: next.length ? next : [day],
                        });
                      }}
                      style={{
                        fontSize: 11,
                        padding: "6px 8px",
                        borderRadius: 6,
                        border: `1px solid ${on ? "var(--accent-blue)" : "var(--border-color)"}`,
                        background: on ? "rgba(59, 130, 246, 0.15)" : "var(--bg-tertiary)",
                        color: on ? "var(--accent-blue)" : "var(--text-muted)",
                        cursor: "pointer",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Links */}
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
            <Link size={14} /> Links
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {urls.map((u, i) => (
              <div
                key={i}
                style={{ display: "flex", gap: 8, alignItems: "center" }}
              >
                <input
                  type="url"
                  value={u}
                  onChange={(e) => {
                    const next = [...urls];
                    next[i] = e.target.value;
                    setUrls(next);
                  }}
                  onBlur={commitUrls}
                  placeholder="https://..."
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    boxSizing: "border-box",
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = urls.filter((_, j) => j !== i);
                    setUrls(next);
                    const cleaned = next.map((x) => x.trim()).filter(Boolean);
                    save({ urls: cleaned });
                  }}
                  style={{
                    flexShrink: 0,
                    padding: "6px 10px",
                    fontSize: 12,
                    borderRadius: 6,
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-tertiary)",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                  }}
                  title="Remove link"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setUrls((prev) => [...prev, ""])}
              style={{
                alignSelf: "flex-start",
                padding: "6px 12px",
                fontSize: 12,
                borderRadius: 6,
                border: "1px dashed var(--border-color)",
                background: "transparent",
                color: "var(--accent-blue)",
                cursor: "pointer",
              }}
            >
              + Add link
            </button>
          </div>
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
