"use client";

import React, { useEffect, useMemo, useState } from "react";

interface Props {
  open: boolean;
  taskTitle: string;
  dateYmd: string;
  noteText: string;
  saving: boolean;
  onDateChange: (next: string) => void;
  onTextChange: (next: string) => void;
  onClose: () => void;
}

function clampYmd(input: string): string {
  const s = input.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

export default function RecurringTaskNotesModal({
  open,
  taskTitle,
  dateYmd,
  noteText,
  saving,
  onDateChange,
  onTextChange,
  onClose,
}: Props) {
  const displayTitle = useMemo(
    () => taskTitle.trim() || "Untitled",
    [taskTitle]
  );

  const safeDate = useMemo(() => clampYmd(dateYmd), [dateYmd]);
  const [localDate, setLocalDate] = useState(safeDate);

  useEffect(() => {
    if (!open) return;
    setLocalDate(safeDate);
  }, [open, safeDate]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="recurring-notes-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 420,
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
          maxWidth: 560,
          maxHeight: "min(78vh, 640px)",
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
            id="recurring-notes-modal-title"
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 700,
              color: "var(--text-primary)",
              minWidth: 0,
            }}
          >
            Daily notes · {displayTitle}
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
            {saving ? "Saving…" : "Close"}
          </button>
        </div>

        <div
          style={{
            padding: "14px 18px 18px",
            overflow: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <label
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              Date
            </label>

            <input
              type="date"
              value={localDate}
              onChange={(e) => {
                const next = e.target.value;
                setLocalDate(next);
                onDateChange(next);
              }}
              style={{
                flex: 1,
                minWidth: 0,
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid var(--border-color)",
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                color: "var(--text-secondary)",
                marginBottom: 6,
                fontWeight: 600,
              }}
            >
              Note
            </label>
            <textarea
              value={noteText}
              onChange={(e) => onTextChange(e.target.value)}
              rows={9}
              placeholder="Add notes for this date…"
              autoFocus
              style={{
                width: "100%",
                resize: "vertical",
                minHeight: 180,
                borderRadius: 8,
                padding: 12,
                border: "1px solid var(--border-color)",
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
                lineHeight: 1.5,
                boxSizing: "border-box",
                fontFamily: "inherit",
              }}
            />
          </div>

          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {saving ? "Saving changes…" : "Changes are saved to the daily notes page."}
          </div>
        </div>
      </div>
    </div>
  );
}

