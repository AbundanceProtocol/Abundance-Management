"use client";

import React, { useState, useCallback } from "react";
import { useSections, useTasks } from "@/lib/hooks";
import TasksCalendarView from "./TasksCalendarView";
import TaskDetailPanel from "./TaskDetailPanel";
import { AppNavTasksPages } from "./AppNavTasksPages";
import SettingsModal from "./SettingsModal";
import { Settings as SettingsIcon, Calendar as CalendarIcon } from "./Icons";
import { useViewportNarrow } from "@/lib/useViewportNarrow";

export default function CalendarStandaloneView() {
  const {
    sections,
    loading: sectionsLoading,
    updateSection,
    refetch: refetchSections,
  } = useSections();
  const {
    tasks,
    loading: tasksLoading,
    updateTask,
    createTask,
    reorderTasks,
    duplicateTaskWithSubtree,
    refetch: refetchTasks,
  } = useTasks();

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const viewportNarrow = useViewportNarrow();

  const handleImportComplete = useCallback(() => {
    refetchSections();
    refetchTasks();
  }, [refetchSections, refetchTasks]);

  const selectedTask = tasks.find((t) => t._id === selectedTaskId) ?? null;
  const selectedTaskSection = selectedTask
    ? (sections.find((s) => s._id === selectedTask.sectionId) ?? null)
    : null;

  const [duplicateBusy, setDuplicateBusy] = useState(false);

  const handleDuplicate = useCallback(async () => {
    if (!selectedTaskId) return;
    setDuplicateBusy(true);
    try {
      const rootId = await duplicateTaskWithSubtree(selectedTaskId);
      setSelectedTaskId(rootId);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Duplicate failed");
    } finally {
      setDuplicateBusy(false);
    }
  }, [selectedTaskId, duplicateTaskWithSubtree]);

  const filteredTasks = showCompleted
    ? tasks
    : tasks.filter((t) => !t.completed);

  const tasksWithDue = tasks.filter((t) => t.dueDate && (showCompleted || !t.completed));

  if (sectionsLoading || tasksLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          color: "var(--text-muted)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 32,
              height: 32,
              border: "3px solid var(--border-color)",
              borderTopColor: "var(--accent-blue)",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto 12px",
            }}
          />
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Main area */}
      <div
        style={{
          flex: 1,
          maxWidth: selectedTask ? "calc(100% - 380px)" : "100%",
          transition: "max-width 0.2s",
          overflowX: "hidden",
        }}
      >
        {/* Header */}
        <header
          style={{
            padding: viewportNarrow ? "12px 16px 12px" : "20px 24px 16px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: viewportNarrow ? "stretch" : "flex-start",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
              width: "100%",
              flexDirection: viewportNarrow ? "column" : "row",
            }}
          >
            <div style={viewportNarrow ? { width: "100%", minWidth: 0 } : undefined}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 2,
                }}
              >
                <span style={{ color: "var(--accent-blue)", flexShrink: 0, display: "inline-flex" }}>
                  <CalendarIcon size={18} />
                </span>
                <h1
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    margin: 0,
                    color: "var(--text-primary)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  Calendar
                </h1>
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-muted)",
                  margin: "4px 0 0",
                }}
              >
                {tasksWithDue.length} task{tasksWithDue.length !== 1 ? "s" : ""} with due dates
              </p>
              <div style={{ marginTop: 10 }}>
                <AppNavTasksPages active="calendar" compact={viewportNarrow} />
              </div>
            </div>

            {/* Controls */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
                justifyContent: viewportNarrow ? "flex-start" : "flex-end",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={showCompleted}
                  onChange={(e) => setShowCompleted(e.target.checked)}
                  style={{ cursor: "pointer" }}
                />
                Show completed
              </label>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                title="Settings"
                style={{
                  fontSize: 13,
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-tertiary)",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <SettingsIcon size={15} />
                {!viewportNarrow && "Settings"}
              </button>
            </div>
          </div>
        </header>

        {/* Calendar */}
        <div style={{ padding: "16px 0 24px" }}>
          <TasksCalendarView
            tasks={showCompleted ? tasks : filteredTasks}
            sections={sections}
            onSelectTask={setSelectedTaskId}
            selectedTaskId={selectedTaskId}
            fullPage
          />
        </div>
      </div>

      {/* Detail panel */}
      {selectedTask && (
        <TaskDetailPanel
          key={selectedTask._id}
          task={selectedTask}
          section={selectedTaskSection}
          directChildCount={tasks.filter((t) => t.parentId === selectedTask._id).length}
          onUpdate={updateTask}
          onClose={() => setSelectedTaskId(null)}
          onDuplicate={handleDuplicate}
          duplicateBusy={duplicateBusy}
          tasks={tasks}
          reorderTasks={reorderTasks}
          createTask={createTask}
          onNavigateToTask={(id) => setSelectedTaskId(id)}
        />
      )}

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onImportComplete={handleImportComplete}
      />
    </div>
  );
}
