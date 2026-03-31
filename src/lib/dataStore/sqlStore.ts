import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { Pool } from "pg";
import type { AppDataStore } from "@/lib/dataStore/types";
import { readAppConfig } from "@/lib/appConfig";

type Engine = "postgres" | "sqlite";

async function ensurePg(pool: Pool) {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS sections (id TEXT PRIMARY KEY, doc JSONB NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, doc JSONB NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS pages_environment (id TEXT PRIMARY KEY, doc JSONB NOT NULL, updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS mind_maps_environment (id TEXT PRIMARY KEY, doc JSONB NOT NULL, updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, email TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS password_reset_tokens (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL, expires_at TEXT NOT NULL)`,
  ];
  for (const s of stmts) await pool.query(s);
}

function ensureSqlite(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sections (id TEXT PRIMARY KEY, doc TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, doc TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pages_environment (id TEXT PRIMARY KEY, doc TEXT NOT NULL, updated_at TEXT);
    CREATE TABLE IF NOT EXISTS mind_maps_environment (id TEXT PRIMARY KEY, doc TEXT NOT NULL, updated_at TEXT);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, email TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS password_reset_tokens (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL, expires_at TEXT NOT NULL);
  `);
}

export async function createSqlStore(engine: Engine): Promise<AppDataStore> {
  const cfg = readAppConfig();
  if (engine === "postgres") {
    const url = cfg?.postgresUrl?.trim();
    if (!url) throw new Error("Missing postgresUrl in app config");
    const pool = new Pool({ connectionString: url });
    await ensurePg(pool);
    const { buildPostgresDataStore } = await import("@/lib/dataStore/postgresImpl");
    return buildPostgresDataStore(pool);
  }
  const rawPath = cfg?.sqlitePath?.trim() || path.join(process.cwd(), "data", "app.db");
  const dir = path.dirname(rawPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(rawPath);
  ensureSqlite(db);
  const { buildSqliteDataStore } = await import("@/lib/dataStore/sqliteImpl");
  return buildSqliteDataStore(db);
}

export async function testSqliteConnection(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(filePath);
  try {
    ensureSqlite(db);
    db.prepare("SELECT 1").get();
  } finally {
    db.close();
  }
}

export async function testPostgresConnection(url: string): Promise<void> {
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 8000 });
  try {
    await ensurePg(pool);
    await pool.query("SELECT 1");
  } finally {
    await pool.end();
  }
}
