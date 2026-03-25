"use client";

import React from "react";

interface Props {
  open: boolean;
  /** User-facing name for the frame (title or type). */
  artifactLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteWorkspaceArtifactModal({
  open,
  artifactLabel,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  const display = artifactLabel.trim() || "This item";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-artifact-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 350,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(0,0,0,0.55)",
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 400,
          borderRadius: 10,
          border: "1px solid var(--border-color)",
          background: "var(--bg-secondary)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
          padding: "20px 22px",
        }}
      >
        <h2
          id="delete-artifact-title"
          style={{
            margin: "0 0 10px",
            fontSize: 16,
            fontWeight: 700,
            color: "var(--text-primary)",
          }}
        >
          Delete workspace item?
        </h2>
        <p
          style={{
            margin: "0 0 8px",
            fontSize: 14,
            color: "var(--text-secondary)",
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: "var(--text-primary)" }}>{display}</strong>{" "}
          will be removed from this canvas.
        </p>
        <p style={{ margin: "0 0 18px", fontSize: 12, color: "var(--text-muted)" }}>
          This can&apos;t be undone.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid var(--border-color)",
              background: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid rgba(248,113,113,0.5)",
              background: "rgba(248,113,113,0.15)",
              color: "#f87171",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
