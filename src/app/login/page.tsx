"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
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
          Abundance Strategy
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
          autoComplete="current-password"
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
          disabled={loading || !password.trim()}
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
            opacity: loading || !password.trim() ? 0.6 : 1,
          }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
