"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Engine = "mongo" | "postgres" | "sqlite";

export default function SetupPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [engine, setEngine] = useState<Engine>("mongo");
  const [mongoUri, setMongoUri] = useState("mongodb://localhost:27017");
  const [mongoDbName, setMongoDbName] = useState("abundance-strategy");
  const [postgresUrl, setPostgresUrl] = useState("postgres://user:pass@localhost:5432/abundance");
  const [sqlitePath, setSqlitePath] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [authSecret, setAuthSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/setup/status");
        const data = (await res.json()) as { needsWizard?: boolean };
        if (cancelled) return;
        if (!data.needsWizard) {
          router.replace("/");
          return;
        }
        setChecked(true);
      } catch {
        if (!cancelled) setChecked(true);
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
      const body: Record<string, unknown> = {
        engine,
        username: username.trim(),
        password,
        email: email.trim(),
      };
      if (authSecret.trim().length >= 16) body.authSecret = authSecret.trim();
      if (engine === "mongo") {
        body.mongoUri = mongoUri.trim();
        body.mongoDbName = mongoDbName.trim() || "abundance-strategy";
      } else if (engine === "postgres") {
        body.postgresUrl = postgresUrl.trim();
      } else {
        if (sqlitePath.trim()) body.sqlitePath = sqlitePath.trim();
      }
      const res = await fetch("/api/setup/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Setup failed");
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  if (!checked) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-primary)",
          color: "var(--text-muted)",
        }}
      >
        Loading…
      </div>
    );
  }

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
          maxWidth: 440,
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
          First-time setup
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px" }}>
          Choose where data is stored and create an admin account. Session signing uses an auth secret
          (auto-generated unless you set one below, min 16 characters).
        </p>

        <label style={labelStyle}>Database</label>
        <select
          value={engine}
          onChange={(e) => setEngine(e.target.value as Engine)}
          style={inputStyle}
        >
          <option value="mongo">MongoDB</option>
          <option value="postgres">PostgreSQL</option>
          <option value="sqlite">SQLite (file)</option>
        </select>

        {engine === "mongo" ? (
          <>
            <label style={labelStyle}>MongoDB URI</label>
            <input
              value={mongoUri}
              onChange={(e) => setMongoUri(e.target.value)}
              style={inputStyle}
              placeholder="mongodb://localhost:27017"
            />
            <label style={labelStyle}>Database name</label>
            <input
              value={mongoDbName}
              onChange={(e) => setMongoDbName(e.target.value)}
              style={inputStyle}
            />
            <p style={hintStyle}>
              Use a connection string your server can reach. For local dev, run MongoDB on the default port
              or use Docker.
            </p>
          </>
        ) : null}

        {engine === "postgres" ? (
          <>
            <label style={labelStyle}>PostgreSQL URL</label>
            <input
              value={postgresUrl}
              onChange={(e) => setPostgresUrl(e.target.value)}
              style={inputStyle}
              placeholder="postgres://user:password@host:5432/dbname"
            />
            <p style={hintStyle}>
              Standard libpq connection URI. The app creates tables on first connect.
            </p>
          </>
        ) : null}

        {engine === "sqlite" ? (
          <>
            <label style={labelStyle}>Database file path (optional)</label>
            <input
              value={sqlitePath}
              onChange={(e) => setSqlitePath(e.target.value)}
              style={inputStyle}
              placeholder="Leave empty for ./data/app.db"
            />
            <p style={hintStyle}>Relative paths are resolved from the app working directory.</p>
          </>
        ) : null}

        <label style={labelStyle}>Admin username</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={inputStyle}
          autoComplete="username"
        />

        <label style={labelStyle}>Admin email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
          autoComplete="email"
        />

        <label style={labelStyle}>Admin password (min 8 characters)</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
          autoComplete="new-password"
        />

        <label style={labelStyle}>Auth secret (optional, min 16 chars)</label>
        <input
          type="password"
          value={authSecret}
          onChange={(e) => setAuthSecret(e.target.value)}
          style={inputStyle}
          placeholder="Leave blank to auto-generate"
          autoComplete="off"
        />

        {error ? (
          <p style={{ color: "var(--accent-red)", fontSize: 13, margin: "12px 0 0" }}>{error}</p>
        ) : null}

        <button
          type="submit"
          disabled={
            loading ||
            !username.trim() ||
            !email.trim() ||
            password.length < 8
          }
          style={{
            marginTop: 20,
            width: "100%",
            padding: "10px 14px",
            borderRadius: 6,
            border: "none",
            background: "var(--accent-blue)",
            color: "#fff",
            fontWeight: 600,
            fontSize: 14,
            cursor: loading ? "wait" : "pointer",
            opacity:
              loading || !username.trim() || !email.trim() || password.length < 8 ? 0.6 : 1,
          }}
        >
          {loading ? "Saving…" : "Complete setup"}
        </button>
      </form>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "var(--text-secondary)",
  marginBottom: 8,
  marginTop: 14,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 6,
  border: "1px solid var(--border-color)",
  background: "var(--bg-primary)",
  color: "var(--text-primary)",
  fontSize: 15,
};

const hintStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--text-muted)",
  margin: "8px 0 0",
  lineHeight: 1.45,
};