"use client";

import React, { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Upload, LogOut } from "./Icons";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after a successful import so the parent can refetch data. */
  onImportComplete?: () => void;
}

export default function SettingsModal({ open, onClose, onImportComplete }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    sections: number;
    tasks: number;
    hasPages: boolean;
    raw: unknown;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch("/api/backup/export");
      if (!res.ok) throw new Error("Export failed");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `abundance-backup-${date}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setError(null);
      setImportPreview(null);
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const raw = JSON.parse(reader.result as string);
          if (
            typeof raw.version !== "number" ||
            !Array.isArray(raw.sections) ||
            !Array.isArray(raw.tasks)
          ) {
            setError("Invalid backup file format.");
            return;
          }
          setImportPreview({
            sections: raw.sections.length,
            tasks: raw.tasks.length,
            hasPages: raw.pagesEnvironment != null,
            raw,
          });
        } catch {
          setError("Could not parse file as JSON.");
        }
      };
      reader.readAsText(file);
    },
    []
  );

  const handleConfirmImport = useCallback(async () => {
    if (!importPreview) return;
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/backup/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(importPreview.raw),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === "string" ? data.error : "Import failed"
        );
      }
      setImportPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      onImportComplete?.();
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }, [importPreview, onImportComplete, onClose, router]);

  const handleCancelImport = useCallback(() => {
    setImportPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const handleSignOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }, [router]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--bg-primary)",
          border: "1px solid var(--border-color)",
          borderRadius: 12,
          width: "100%",
          maxWidth: 420,
          padding: "24px 24px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h2
            style={{
              fontSize: 18,
              fontWeight: 700,
              margin: 0,
              color: "var(--text-primary)",
            }}
          >
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 20,
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "4px 8px",
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>

        {/* Backup section */}
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "var(--text-muted)",
              marginBottom: 10,
            }}
          >
            Data backup
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid var(--border-color)",
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
                cursor: exporting ? "wait" : "pointer",
                fontSize: 13,
                fontWeight: 500,
                opacity: exporting ? 0.6 : 1,
                width: "100%",
                textAlign: "left",
              }}
            >
              <Download size={16} />
              {exporting ? "Downloading..." : "Download backup"}
            </button>

            <label
              htmlFor="settings-backup-file-input"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid var(--border-color)",
                background: "var(--bg-secondary)",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-primary)",
                cursor: "pointer",
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              <Upload size={16} />
              Restore from backup
              <input
                id="settings-backup-file-input"
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileSelect}
                style={{ display: "none" }}
              />
            </label>
          </div>

          {importPreview && (
            <div
              style={{
                marginTop: 12,
                padding: "12px 14px",
                borderRadius: 8,
                border: "1px solid var(--accent-amber, #f59e0b)",
                background: "rgba(251, 191, 36, 0.08)",
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  color: "var(--accent-amber, #f59e0b)",
                  marginBottom: 6,
                }}
              >
                Confirm restore
              </div>
              <p style={{ margin: "0 0 8px", color: "var(--text-secondary)" }}>
                This will <strong>replace all existing data</strong> with the
                backup contents:
              </p>
              <ul
                style={{
                  margin: "0 0 10px",
                  paddingLeft: 18,
                  color: "var(--text-secondary)",
                }}
              >
                <li>{importPreview.sections} section(s)</li>
                <li>{importPreview.tasks} task(s)</li>
                {importPreview.hasPages && <li>Pages data included</li>}
              </ul>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={importing}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 6,
                    border: "none",
                    background: "var(--accent-red, #ef4444)",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: importing ? "wait" : "pointer",
                    opacity: importing ? 0.6 : 1,
                  }}
                >
                  {importing ? "Restoring..." : "Replace all data"}
                </button>
                <button
                  type="button"
                  onClick={handleCancelImport}
                  disabled={importing}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 6,
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-tertiary)",
                    color: "var(--text-secondary)",
                    fontWeight: 500,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: "var(--accent-red, #ef4444)",
              lineHeight: 1.4,
            }}
          >
            {error}
          </p>
        )}

        {/* Divider */}
        <div
          style={{
            borderTop: "1px solid var(--border-color)",
            margin: "0 -24px",
          }}
        />

        {/* Sign out */}
        <button
          type="button"
          onClick={handleSignOut}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid var(--border-color)",
            background: "var(--bg-secondary)",
            color: "var(--text-primary)",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 500,
            width: "100%",
            textAlign: "left",
          }}
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </div>
  );
}
