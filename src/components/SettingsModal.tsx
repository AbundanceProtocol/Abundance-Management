"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Download, Upload, LogOut } from "./Icons";

type SettingsTab = "backup" | "calendar" | "account" | "sharing" | "danger";

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
  const [activeTab, setActiveTab] = useState<SettingsTab>("backup");
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

  // Google Calendar
  const [gcal, setGcal] = useState<{
    configured: boolean;
    connected: boolean;
    calendarId: string | null;
    connectedAt: string | null;
  } | null>(null);
  const [gcalClientId, setGcalClientId] = useState("");
  const [gcalClientSecret, setGcalClientSecret] = useState("");
  const [gcalConfigSaving, setGcalConfigSaving] = useState(false);
  const [gcalConfigOk, setGcalConfigOk] = useState(false);
  const [gcalConnecting, setGcalConnecting] = useState(false);
  const [gcalSyncing, setGcalSyncing] = useState(false);
  const [gcalSyncResult, setGcalSyncResult] = useState<string | null>(null);
  const [gcalDisconnecting, setGcalDisconnecting] = useState(false);

  // Sharing / view-only tokens
  type ViewTokenLocal = { _id: string; name: string; token: string; createdAt: string };
  const [viewTokens, setViewTokens] = useState<ViewTokenLocal[]>([]);
  const [sharingLoading, setSharingLoading] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [creatingView, setCreatingView] = useState(false);
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setActiveTab("backup");
    setError(null);
    setCredOk(null);
    setGcalSyncResult(null);
    setGcalConfigOk(false);
    (async () => {
      try {
        const [sessionRes, gcalRes] = await Promise.all([
          fetch("/api/auth/session"),
          fetch("/api/google-calendar/status"),
        ]);
        const sessionData = (await sessionRes.json()) as { account?: SessionAccount };
        if (!cancelled && sessionData.account) setAccount(sessionData.account);
        if (gcalRes.ok) {
          const gcalData = await gcalRes.json() as { configured: boolean; connected: boolean; calendarId: string | null; connectedAt: string | null };
          if (!cancelled) setGcal(gcalData);
        }
      } catch {
        if (!cancelled) setAccount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Clear tab-specific errors when switching tabs
  useEffect(() => {
    setError(null);
  }, [activeTab]);

  // Load view tokens when sharing tab is active
  useEffect(() => {
    if (!open || activeTab !== "sharing") return;
    let cancelled = false;
    setSharingLoading(true);
    fetch("/api/view-tokens")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (!cancelled) setViewTokens(Array.isArray(data) ? data : []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setSharingLoading(false); });
    return () => { cancelled = true; };
  }, [open, activeTab]);

  const credCanSubmit = useMemo(() => {
    if (credSaving || !currentPassword.trim()) return false;
    const u = account?.username ?? "";
    const usernameChanged =
      newUsername.trim().length > 0 &&
      newUsername.trim().toLowerCase() !== u.toLowerCase();
    if (newPassword.length > 0 && newPassword.length < 8) return false;
    const passwordOk = newPassword.length >= 8;
    return passwordOk || usernameChanged;
  }, [credSaving, currentPassword, newUsername, newPassword, account?.username]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch("/api/backup/export");
      if (!res.ok) throw new Error("Export failed");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
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

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setImportPreview(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(reader.result as string);
        if (typeof raw.version !== "number" || !Array.isArray(raw.sections) || !Array.isArray(raw.tasks)) {
          setError("Invalid backup file format.");
          return;
        }
        setImportPreview({ sections: raw.sections.length, tasks: raw.tasks.length, hasPages: raw.pagesEnvironment != null, raw });
      } catch {
        setError("Could not parse file as JSON.");
      }
    };
    reader.readAsText(file);
  }, []);

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
        throw new Error(typeof data.error === "string" ? data.error : "Import failed");
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

  const handleGcalSaveConfig = useCallback(async () => {
    setGcalConfigSaving(true);
    setError(null);
    setGcalConfigOk(false);
    try {
      const res = await fetch("/api/settings/google-calendar-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleClientId: gcalClientId, googleClientSecret: gcalClientSecret }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(typeof data.error === "string" ? data.error : "Save failed"); return; }
      setGcalConfigOk(true);
      setGcal((prev) => ({ ...prev, configured: true, connected: prev?.connected ?? false, calendarId: prev?.calendarId ?? null, connectedAt: prev?.connectedAt ?? null }));
    } catch { setError("Network error"); }
    finally { setGcalConfigSaving(false); }
  }, [gcalClientId, gcalClientSecret]);

  const handleGcalConnect = useCallback(async () => {
    setGcalConnecting(true);
    setError(null);
    try {
      const res = await fetch("/api/google-calendar/auth-url");
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) { setError("Could not get authorization URL."); return; }
      window.location.href = data.url as string;
    } catch { setError("Network error"); }
    finally { setGcalConnecting(false); }
  }, []);

  const handleGcalSync = useCallback(async () => {
    setGcalSyncing(true);
    setGcalSyncResult(null);
    setError(null);
    try {
      const res = await fetch("/api/google-calendar/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(typeof data.error === "string" ? data.error : "Sync failed"); return; }
      setGcalSyncResult(`Synced ${data.synced} task${data.synced !== 1 ? "s" : ""}${data.errors > 0 ? `, ${data.errors} error${data.errors !== 1 ? "s" : ""}` : ""}.`);
    } catch { setError("Network error"); }
    finally { setGcalSyncing(false); }
  }, []);

  const handleGcalDisconnect = useCallback(async () => {
    setGcalDisconnecting(true);
    setError(null);
    try {
      const res = await fetch("/api/google-calendar/disconnect", { method: "DELETE" });
      if (!res.ok) { setError("Disconnect failed"); return; }
      setGcal((prev) => prev ? { ...prev, connected: false, calendarId: null, connectedAt: null } : null);
      setGcalSyncResult(null);
    } catch { setError("Network error"); }
    finally { setGcalDisconnecting(false); }
  }, []);

  const handleCreateView = useCallback(async () => {
    if (!newViewName.trim()) return;
    setCreatingView(true);
    try {
      const res = await fetch("/api/view-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newViewName.trim() }),
      });
      if (!res.ok) { setError("Failed to create view"); return; }
      const vt = await res.json();
      setViewTokens((prev) => [...prev, vt]);
      setNewViewName("");
      window.dispatchEvent(new Event("viewtokens:updated"));
    } catch { setError("Network error"); }
    finally { setCreatingView(false); }
  }, [newViewName]);

  const handleDeleteView = useCallback(async (id: string) => {
    try {
      await fetch(`/api/view-tokens?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setViewTokens((prev) => prev.filter((v) => v._id !== id));
      window.dispatchEvent(new Event("viewtokens:updated"));
    } catch { setError("Failed to delete view"); }
  }, []);

  const handleCopyLink = useCallback((token: string, id: string) => {
    const base = window.location.origin;
    navigator.clipboard.writeText(`${base}/view/${token}`).then(() => {
      setCopiedTokenId(id);
      setTimeout(() => setCopiedTokenId(null), 2000);
    }).catch(() => {});
  }, []);

  if (!open) return null;

  const showAccount = account && !account.skipAuth;

  const navItems: { key: SettingsTab; label: string; icon?: React.ReactNode }[] = [
    { key: "backup", label: "Backup" },
    { key: "calendar", label: "Google Cal", icon: <Calendar size={13} /> },
    { key: "sharing", label: "Sharing" },
    ...(showAccount ? [{ key: "account" as SettingsTab, label: "Account" }] : []),
    { key: "danger", label: "Danger zone" },
  ];

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
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--bg-primary)",
          border: "1px solid var(--border-color)",
          borderRadius: 12,
          width: "100%",
          maxWidth: 580,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          maxHeight: "90vh",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-color)",
            flexShrink: 0,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
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
              padding: "2px 6px",
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>

        {/* Body: sidebar + content */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
          {/* Sidebar nav */}
          <div
            style={{
              width: 148,
              flexShrink: 0,
              borderRight: "1px solid var(--border-color)",
              display: "flex",
              flexDirection: "column",
              padding: "10px 0",
            }}
          >
            <div style={{ flex: 1 }}>
              {navItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveTab(item.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 16px",
                    border: "none",
                    background: activeTab === item.key ? "var(--bg-secondary)" : "transparent",
                    color: activeTab === item.key
                      ? (item.key === "danger" ? "var(--accent-red, #ef4444)" : "var(--text-primary)")
                      : (item.key === "danger" ? "var(--accent-red, #ef4444)" : "var(--text-secondary)"),
                    fontSize: 13,
                    fontWeight: activeTab === item.key ? 600 : 400,
                    cursor: "pointer",
                    borderRadius: 0,
                    borderLeft: activeTab === item.key
                      ? "2px solid var(--accent-blue)"
                      : "2px solid transparent",
                  }}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>

            {/* Sign out always at bottom */}
            <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: 8 }}>
              <button
                type="button"
                onClick={handleSignOut}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 16px",
                  border: "none",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  fontSize: 13,
                  fontWeight: 400,
                  cursor: "pointer",
                  borderLeft: "2px solid transparent",
                }}
              >
                <LogOut size={13} />
                Sign out
              </button>
            </div>
          </div>

          {/* Content pane */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "20px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            {activeTab === "backup" && (
              <>
                <SectionHeading>Data backup</SectionHeading>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button
                    type="button"
                    onClick={handleExport}
                    disabled={exporting}
                    style={actionBtn(exporting)}
                  >
                    <Download size={16} />
                    {exporting ? "Downloading..." : "Download backup"}
                  </button>
                  <label
                    htmlFor="settings-backup-file-input"
                    style={{ ...actionBtn(false), display: "flex" } as React.CSSProperties}
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
                      padding: "12px 14px",
                      borderRadius: 8,
                      border: "1px solid var(--accent-amber, #f59e0b)",
                      background: "rgba(251, 191, 36, 0.08)",
                      fontSize: 12,
                      lineHeight: 1.5,
                    }}
                  >
                    <div style={{ fontWeight: 600, color: "var(--accent-amber, #f59e0b)", marginBottom: 6 }}>
                      Confirm restore
                    </div>
                    <p style={{ margin: "0 0 8px", color: "var(--text-secondary)" }}>
                      This will <strong>replace all existing data</strong> with the backup contents:
                    </p>
                    <ul style={{ margin: "0 0 10px", paddingLeft: 18, color: "var(--text-secondary)" }}>
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
              </>
            )}

            {activeTab === "calendar" && (
              <>
                <SectionHeading icon={<Calendar size={13} />}>Google Calendar</SectionHeading>
                {!gcal ? (
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>Loading…</p>
                ) : (
                  <>
                    {/* State A: not configured */}
                    {!gcal.configured && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                          Enter your Google OAuth 2.0 credentials from{" "}
                          <a
                            href="https://console.cloud.google.com/apis/credentials"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "var(--accent-blue)" }}
                          >
                            Google Cloud Console
                          </a>
                          . Add{" "}
                          <code style={{ fontSize: 11 }}>/api/google-calendar/callback</code> as an
                          authorized redirect URI.
                        </p>
                        <label style={labelSm}>Client ID</label>
                        <input
                          type="text"
                          value={gcalClientId}
                          onChange={(e) => setGcalClientId(e.target.value)}
                          placeholder="123456789-abc.apps.googleusercontent.com"
                          style={inputSm}
                          autoComplete="off"
                        />
                        <label style={labelSm}>Client Secret</label>
                        <input
                          type="password"
                          value={gcalClientSecret}
                          onChange={(e) => setGcalClientSecret(e.target.value)}
                          placeholder="GOCSPX-…"
                          style={inputSm}
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          onClick={handleGcalSaveConfig}
                          disabled={gcalConfigSaving || !gcalClientId.trim() || !gcalClientSecret.trim()}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 8,
                            border: "none",
                            background: "var(--accent-blue)",
                            color: "#fff",
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: gcalConfigSaving ? "wait" : "pointer",
                            opacity: gcalConfigSaving || !gcalClientId.trim() || !gcalClientSecret.trim() ? 0.55 : 1,
                          }}
                        >
                          {gcalConfigSaving ? "Saving…" : "Save credentials"}
                        </button>
                        {gcalConfigOk && (
                          <p style={{ margin: 0, fontSize: 12, color: "var(--accent-green, #22c55e)" }}>
                            Credentials saved. You can now connect your Google account.
                          </p>
                        )}
                      </div>
                    )}

                    {/* State B: configured but not connected */}
                    {gcal.configured && !gcal.connected && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                          Connect your Google account to push tasks with due dates to Google Calendar.
                        </p>
                        <button
                          type="button"
                          onClick={handleGcalConnect}
                          disabled={gcalConnecting}
                          style={actionBtn(gcalConnecting)}
                        >
                          <Calendar size={16} />
                          {gcalConnecting ? "Redirecting…" : "Connect Google Calendar"}
                        </button>
                      </div>
                    )}

                    {/* State C: connected */}
                    {gcal.configured && gcal.connected && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                          Connected
                          {gcal.connectedAt ? ` since ${new Date(gcal.connectedAt).toLocaleDateString()}` : ""}
                          . Top-level tasks with due dates sync automatically.
                        </p>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            type="button"
                            onClick={handleGcalSync}
                            disabled={gcalSyncing}
                            style={{ ...actionBtn(gcalSyncing), flex: 1 }}
                          >
                            {gcalSyncing ? "Syncing…" : "Sync now"}
                          </button>
                          <button
                            type="button"
                            onClick={handleGcalDisconnect}
                            disabled={gcalDisconnecting}
                            style={{ ...actionBtn(gcalDisconnecting), flex: 1, color: "var(--accent-red, #ef4444)" }}
                          >
                            {gcalDisconnecting ? "Disconnecting…" : "Disconnect"}
                          </button>
                        </div>
                        {gcalSyncResult && (
                          <p style={{ margin: 0, fontSize: 12, color: "var(--accent-green, #22c55e)" }}>
                            {gcalSyncResult}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {activeTab === "account" && showAccount && (
              <>
                <SectionHeading>Account</SectionHeading>
                {account.legacyMode ? (
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    Password is set with <code>APP_PASSWORD</code> in the environment. Change it there
                    and restart the server.
                  </p>
                ) : null}
                {account.canChangeCredentials ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
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
                      <p style={{ margin: 0, fontSize: 12, color: "var(--accent-green, #22c55e)" }}>
                        {credOk}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {account.needsReauthForCredentials ? (
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    Sign out and sign in once more to enable changing your username or password from here.
                  </p>
                ) : null}
              </>
            )}

            {activeTab === "danger" && (
              <>
                <SectionHeading danger>Danger zone</SectionHeading>
                <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
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
                    <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: 16, marginTop: 4 }} />
                    <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
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
                      disabled={resettingDb || resetDbConfirm !== "RESET_DATABASE_CONFIGURATION"}
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        borderRadius: 8,
                        border: "1px solid var(--accent-red, #ef4444)",
                        background: "rgba(239, 68, 68, 0.12)",
                        color: "var(--accent-red, #ef4444)",
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: resettingDb ? "wait" : "pointer",
                        opacity: resettingDb || resetDbConfirm !== "RESET_DATABASE_CONFIGURATION" ? 0.55 : 1,
                      }}
                    >
                      {resettingDb ? "Working…" : "Reset database & run setup again"}
                    </button>
                  </>
                ) : null}
              </>
            )}

            {activeTab === "sharing" && (
              <>
                <SectionHeading>View-only shared links</SectionHeading>
                <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  Each shared link lets anyone with the URL view your board in read-only mode.
                  You can hide individual tasks per view from the task details panel.
                </p>

                {/* Create new view */}
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    value={newViewName}
                    onChange={(e) => setNewViewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleCreateView(); }}
                    placeholder="View name (e.g. Client View)"
                    style={{ ...inputSm, flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={handleCreateView}
                    disabled={creatingView || !newViewName.trim()}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 6,
                      border: "none",
                      background: "var(--accent-blue)",
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: creatingView || !newViewName.trim() ? "not-allowed" : "pointer",
                      opacity: creatingView || !newViewName.trim() ? 0.6 : 1,
                      flexShrink: 0,
                    }}
                  >
                    {creatingView ? "Creating…" : "Create"}
                  </button>
                </div>

                {/* List of view tokens */}
                {sharingLoading ? (
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>Loading…</p>
                ) : viewTokens.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
                    No shared views yet. Create one above.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {viewTokens.map((vt) => (
                      <div
                        key={vt._id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 12px",
                          borderRadius: 8,
                          border: "1px solid var(--border-color)",
                          background: "var(--bg-secondary)",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                            {vt.name}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: "var(--text-muted)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              marginTop: 2,
                            }}
                          >
                            /view/{vt.token}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyLink(vt.token, vt._id)}
                          style={{
                            padding: "5px 10px",
                            borderRadius: 5,
                            border: "1px solid var(--border-color)",
                            background: copiedTokenId === vt._id ? "var(--bg-success, #16a34a)" : "var(--bg-tertiary)",
                            color: copiedTokenId === vt._id ? "#fff" : "var(--text-secondary)",
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: "pointer",
                            flexShrink: 0,
                            transition: "background 0.2s",
                          }}
                        >
                          {copiedTokenId === vt._id ? "Copied!" : "Copy link"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteView(vt._id)}
                          title="Delete this shared view"
                          style={{
                            padding: "5px 8px",
                            borderRadius: 5,
                            border: "1px solid var(--border-color)",
                            background: "transparent",
                            color: "var(--accent-red, #ef4444)",
                            fontSize: 13,
                            cursor: "pointer",
                            flexShrink: 0,
                            lineHeight: 1,
                          }}
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {error && (
              <p style={{ margin: 0, fontSize: 12, color: "var(--accent-red, #ef4444)", lineHeight: 1.4 }}>
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ children, icon, danger }: { children: React.ReactNode; icon?: React.ReactNode; danger?: boolean }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: danger ? "var(--accent-red, #ef4444)" : "var(--text-muted)",
        display: "flex",
        alignItems: "center",
        gap: 5,
      }}
    >
      {icon}
      {children}
    </div>
  );
}

function actionBtn(disabled: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border-color)",
    background: "var(--bg-secondary)",
    color: "var(--text-primary)",
    cursor: disabled ? "wait" : "pointer",
    fontSize: 13,
    fontWeight: 500,
    opacity: disabled ? 0.6 : 1,
    width: "100%",
    textAlign: "left",
    boxSizing: "border-box",
  };
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
