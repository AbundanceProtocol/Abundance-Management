"use client";

import React from "react";

interface Props {
  open: boolean;
  taskTitle: string;
  notes: string;
  onClose: () => void;
}

export default function TaskNotesModal({
  open,
  taskTitle,
  notes,
  onClose,
}: Props) {
  if (!open) return null;

  const displayTitle = taskTitle.trim() || "Untitled";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-notes-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 360,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(0,0,0,0.55)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          maxHeight: "min(70vh, 520px)",
          borderRadius: 10,
          border: "1px solid var(--border-color)",
          background: "var(--bg-secondary)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px 18px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <h2
            id="task-notes-modal-title"
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 700,
              color: "var(--text-primary)",
              minWidth: 0,
            }}
          >
            Notes · {displayTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              flexShrink: 0,
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid var(--border-color)",
              background: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
        <div
          style={{
            padding: "14px 18px 18px",
            overflow: "auto",
            fontSize: 14,
            lineHeight: 1.55,
            color: "var(--text-secondary)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {notes.trim() || (
            <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
              No text
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
