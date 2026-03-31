"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Upload, LogOut } from "./Icons";

type SessionAccount = {
  skipAuth: boolean;
  legacyMode: boolean;
  username: string | null;
  canChangeCredentials: boolean;
  needsReauthForCredentials: boolean;
  databaseSetupComplete?: boolean;
};

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
  const [account, setAccount] = useState<SessionAccount | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [credSaving, setCredSaving] = useState(false);
  const [credOk, setCredOk] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetDbConfirm, setResetDbConfirm] = useState("");
  const [resettingDb, setResettingDb] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCredOk(null);
    (async () => {
      try {
        const res = await fetch("/api/auth/session");
        const data = (await res.json()) as { account?: SessionAccount };
        if (!cancelled && data.account) setAccount(data.account);
      } catch {
        if (!cancelled) setAccount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const credCanSubmit = useMemo(() => {
    if (credSaving || !currentPassword.trim()) return false;
    const u = account?.username ?? "";
    const usernameChanged =
      newUsername.trim().length > 0 &&
      newUsername.trim().toLowerCase() !== u.toLowerCase();
    if (newPassword.length > 0 && newPassword.length < 8) return false;
    const passwordOk = newPassword.length >= 8;
    return passwordOk || usernameChanged;
  }, [
    credSaving,
    currentPassword,
    newUsername,
    newPassword,
    account?.username,
  ]);

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
      a.download = `project-manager-backup-${date}.json`;
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

  const handleChangeCredentials = useCallback(async () => {
    setCredSaving(true);
    setError(null);
    setCredOk(null);
    try {
      const res = await fetch("/api/settings/change-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          ...(newUsername.trim() ? { newUsername: newUsername.trim() } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Update failed");
        return;
      }
      setCredOk("Saved. You stay signed in with the new credentials.");
      setCurrentPassword("");
      setNewPassword("");
      setNewUsername("");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setCredSaving(false);
    }
  }, [currentPassword, newPassword, newUsername, router]);

  const handleResetApplicationData = useCallback(async () => {
    setResetting(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/reset-application-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: resetConfirm }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Reset failed");
        return;
      }
      setResetConfirm("");
      onImportComplete?.();
      onClose();
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setResetting(false);
    }
  }, [resetConfirm, onImportComplete, onClose, router]);

  const handleResetDatabaseConfiguration = useCallback(async () => {
    setResettingDb(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/reset-database-configuration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: resetDbConfirm }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Reset failed");
        return;
      }
      setResetDbConfirm("");
      onClose();
      router.replace("/setup");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setResettingDb(false);
    }
  }, [resetDbConfirm, onClose, router]);

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

        {/* Account */}
        {account && !account.skipAuth ? (
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
              Account
            </div>
            {account.legacyMode ? (
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  lineHeight: 1.5,
                }}
              >
                Password is set with <code>APP_PASSWORD</code> in the environment. Change it there
                and restart the server.
              </p>
            ) : null}
            {account.canChangeCredentials ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    color: "var(--text-secondary)",
                  }}
                >
                  Signed in as <strong>{account.username}</strong>
                </p>
                <label style={labelSm}>Current password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  style={inputSm}
                />
                <label style={labelSm}>New username (optional)</label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  autoComplete="username"
                  placeholder="Leave blank to keep current"
                  style={inputSm}
                />
                <label style={labelSm}>New password (optional if changing username; min 8 characters)</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  style={inputSm}
                />
                <button
                  type="button"
                  onClick={handleChangeCredentials}
                  disabled={!credCanSubmit}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "none",
                    background: "var(--accent-blue)",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: credSaving ? "wait" : "pointer",
                    opacity: credCanSubmit ? 1 : 0.55,
                  }}
                >
                  {credSaving ? "Saving…" : "Update username / password"}
                </button>
                {credOk ? (
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: "var(--accent-green, #22c55e)",
                    }}
                  >
                    {credOk}
                  </p>
                ) : null}
              </div>
            ) : null}
            {account.needsReauthForCredentials ? (
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  lineHeight: 1.5,
                }}
              >
                Sign out and sign in once more to enable changing your username or password from
                here.
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Danger zone */}
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "var(--accent-red, #ef4444)",
              marginBottom: 10,
            }}
          >
            Danger zone
          </div>
          <p
            style={{
              margin: "0 0 10px",
              fontSize: 12,
              color: "var(--text-secondary)",
              lineHeight: 1.5,
            }}
          >
            Remove all sections, tasks, and pages configuration. Your login account is{" "}
            <strong>not</strong> deleted. Type the phrase below to confirm.
          </p>
          <input
            type="text"
            value={resetConfirm}
            onChange={(e) => setResetConfirm(e.target.value)}
            placeholder="RESET_APPLICATION_DATA"
            style={inputSm}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={handleResetApplicationData}
            disabled={resetting || resetConfirm !== "RESET_APPLICATION_DATA"}
            style={{
              marginTop: 10,
              width: "100%",
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid var(--accent-red, #ef4444)",
              background: "transparent",
              color: "var(--accent-red, #ef4444)",
              fontWeight: 600,
              fontSize: 13,
              cursor: resetting ? "wait" : "pointer",
              opacity: resetting || resetConfirm !== "RESET_APPLICATION_DATA" ? 0.55 : 1,
            }}
          >
            {resetting ? "Resetting…" : "Reset application data"}
          </button>

          {account && account.databaseSetupComplete && !account.skipAuth ? (
            <>
              <div
                style={{
                  borderTop: "1px solid var(--border-color)",
                  marginTop: 18,
                  paddingTop: 18,
                }}
              />
              <p
                style={{
                  margin: "0 0 10px",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  lineHeight: 1.5,
                }}
              >
                <strong>Reset database connection</strong> removes stored engine, connection URLs,
                and setup completion. Your <strong>auth secret is kept</strong> (or use{" "}
                <code>AUTH_SECRET</code> in the environment). You will be signed out and sent to
                first-time setup to choose a <strong>new</strong> database and admin account. Old
                data remains on the previous database server but this app will no longer use it.
              </p>
              <input
                type="text"
                value={resetDbConfirm}
                onChange={(e) => setResetDbConfirm(e.target.value)}
                placeholder="RESET_DATABASE_CONFIGURATION"
                style={inputSm}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={handleResetDatabaseConfiguration}
                disabled={
                  resettingDb || resetDbConfirm !== "RESET_DATABASE_CONFIGURATION"
                }
                style={{
                  marginTop: 10,
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--accent-red, #ef4444)",
                  background: "rgba(239, 68, 68, 0.12)",
                  color: "var(--accent-red, #ef4444)",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: resettingDb ? "wait" : "pointer",
                  opacity:
                    resettingDb || resetDbConfirm !== "RESET_DATABASE_CONFIGURATION"
                      ? 0.55
                      : 1,
                }}
              >
                {resettingDb ? "Working…" : "Reset database & run setup again"}
              </button>
            </>
          ) : null}
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

const labelSm: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-secondary)",
};

const inputSm: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid var(--border-color)",
  background: "var(--bg-secondary)",
  color: "var(--text-primary)",
  fontSize: 13,
};
