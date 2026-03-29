import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import type { DbEngine } from "@/lib/appConfig";
import { writeAppConfig } from "@/lib/appConfig";
import { needsSetupWizard } from "@/lib/setupWizard";
import { getDataStore, invalidateDataStoreCache } from "@/lib/dataStore/factory";
import { testPostgresConnection, testSqliteConnection } from "@/lib/dataStore/sqlStore";
import { testMongoConnection } from "@/lib/mongoConnectTest";

type SetupBody = {
  engine?: string;
  mongoUri?: string;
  mongoDbName?: string;
  postgresUrl?: string;
  sqlitePath?: string;
  username?: string;
  password?: string;
  email?: string;
  authSecret?: string;
};

export async function POST(request: Request) {
  if (!needsSetupWizard()) {
    return NextResponse.json({ error: "Setup already completed" }, { status: 403 });
  }

  let body: SetupBody;
  try {
    body = (await request.json()) as SetupBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const engine = body.engine as DbEngine | undefined;
  if (engine !== "mongo" && engine !== "postgres" && engine !== "sqlite") {
    return NextResponse.json({ error: "Invalid engine" }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";

  if (username.length < 1) {
    return NextResponse.json({ error: "Username is required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }
  if (!email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  const authSecret =
    typeof body.authSecret === "string" && body.authSecret.trim().length >= 16
      ? body.authSecret.trim()
      : randomBytes(32).toString("hex");

  try {
    if (engine === "mongo") {
      const mongoUri = typeof body.mongoUri === "string" ? body.mongoUri.trim() : "";
      if (!mongoUri) {
        return NextResponse.json({ error: "MongoDB URI is required" }, { status: 400 });
      }
      const mongoDbName =
        typeof body.mongoDbName === "string" && body.mongoDbName.trim()
          ? body.mongoDbName.trim()
          : "abundance-strategy";
      await testMongoConnection(mongoUri, mongoDbName);
      writeAppConfig({
        setupComplete: true,
        engine: "mongo",
        mongoUri,
        mongoDbName,
        authSecret,
      });
    } else if (engine === "postgres") {
      const postgresUrl = typeof body.postgresUrl === "string" ? body.postgresUrl.trim() : "";
      if (!postgresUrl) {
        return NextResponse.json({ error: "PostgreSQL URL is required" }, { status: 400 });
      }
      await testPostgresConnection(postgresUrl);
      writeAppConfig({
        setupComplete: true,
        engine: "postgres",
        postgresUrl,
        authSecret,
      });
    } else {
      const sqlitePath =
        typeof body.sqlitePath === "string" && body.sqlitePath.trim()
          ? body.sqlitePath.trim()
          : "";
      const filePath = sqlitePath || `${process.cwd()}/data/app.db`;
      await testSqliteConnection(filePath);
      writeAppConfig({
        setupComplete: true,
        engine: "sqlite",
        sqlitePath: filePath,
        authSecret,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Connection failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  invalidateDataStoreCache();

  try {
    const store = await getDataStore();
    const passwordHash = bcrypt.hashSync(password, 10);
    await store.createUser({
      username,
      email,
      passwordHash,
      role: "admin",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create admin user";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}