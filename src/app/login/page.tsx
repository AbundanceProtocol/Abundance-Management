"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [legacyLogin, setLegacyLogin] = useState<boolean | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/setup/status");
        const data = (await res.json()) as {
          needsWizard?: boolean;
          legacyLogin?: boolean;
        };
        if (cancelled) return;
        if (data.needsWizard) {
          router.replace("/setup");
          return;
        }
        setLegacyLogin(Boolean(data.legacyLogin));
      } catch {
        if (!cancelled) setLegacyLogin(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const body =
        legacyLogin === true
          ? { password }
          : { username: username.trim(), password };
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : "Login failed");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  if (legacyLogin === null) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-primary)",
          color: "var(--text-muted)",
          fontSize: 14,
        }}
      >
        Loading…
      </div>
    );
  }

  const canSubmit =
    legacyLogin === true ? password.trim().length > 0 : username.trim() && password.length > 0;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-primary)",
        padding: 24,
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: "100%",
          maxWidth: 360,
          padding: 28,
          borderRadius: 10,
          border: "1px solid var(--border-color)",
          background: "var(--bg-secondary)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
        }}
      >
        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            margin: "0 0 6px",
            color: "var(--text-primary)",
          }}
        >
          Project Manager
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-muted)",
            margin: "0 0 22px",
          }}
        >
          Sign in to edit tasks
        </p>
        {legacyLogin === false ? (
          <>
            <label
              style={{
                display: "block",
                fontSize: 12,
                color: "var(--text-secondary)",
                marginBottom: 8,
              }}
            >
              Username
            </label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 12px",
                borderRadius: 6,
                border: "1px solid var(--border-color)",
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
                fontSize: 15,
                marginBottom: 16,
              }}
            />
          </>
        ) : null}
        <label
          style={{
            display: "block",
            fontSize: 12,
            color: "var(--text-secondary)",
            marginBottom: 8,
          }}
        >
          Password
        </label>
        <input
          type="password"
          autoComplete={legacyLogin === true ? "current-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            borderRadius: 6,
            border: "1px solid var(--border-color)",
            background: "var(--bg-primary)",
            color: "var(--text-primary)",
            fontSize: 15,
            marginBottom: 16,
          }}
        />
        {error ? (
          <p style={{ color: "var(--accent-red)", fontSize: 13, margin: "0 0 12px" }}>
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={loading || !canSubmit}
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: 6,
            border: "none",
            background: "var(--accent-blue)",
            color: "#fff",
            fontWeight: 600,
            fontSize: 14,
            cursor: loading ? "wait" : "pointer",
            opacity: loading || !canSubmit ? 0.6 : 1,
          }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}