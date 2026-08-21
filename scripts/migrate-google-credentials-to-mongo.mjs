/**
 * One-time migration: copies Google Client ID / Secret that were previously saved to the
 * local `data/app-config.json` file (the old, file-based storage used before credentials
 * were moved into the database) into MongoDB, where they now live.
 *
 * Not needed for a fresh setup — only run this if you have an existing
 * `data/app-config.json` from before this change with googleClientId/googleClientSecret
 * already filled in, and want to carry them over instead of re-pasting them in Settings.
 *
 * Usage (from the project root):
 *   node --env-file=.env.local scripts/migrate-google-credentials-to-mongo.mjs
 *
 * If your Node version doesn't support --env-file (Node < 20.6), this script also loads
 * a .env.local file in the project root itself, so plain `node scripts/...` works too.
 */
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { MongoClient } from "mongodb";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

function loadDotEnvLocal() {
  const envPath = path.join(projectRoot, ".env.local");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnvLocal();

const configPath = path.join(projectRoot, "data", "app-config.json");

if (!existsSync(configPath)) {
  console.log(`No local config file found at ${configPath} — nothing to migrate.`);
  process.exit(0);
}

const config = JSON.parse(readFileSync(configPath, "utf8"));
const clientId = config?.googleClientId?.trim();
const clientSecret = config?.googleClientSecret?.trim();

if (!clientId || !clientSecret) {
  console.log("Local config file has no googleClientId/googleClientSecret — nothing to migrate.");
  process.exit(0);
}

const mongoUri =
  config?.mongoUri?.trim() || process.env.MONGODB_URI || "mongodb://localhost:27017/abundance-strategy";
const dbName = config?.mongoDbName?.trim() || "abundance-strategy";

console.log(`Connecting to MongoDB (db: "${dbName}")…`);
const client = new MongoClient(mongoUri);

try {
  await client.connect();
  const db = client.db(dbName);
  await db.collection("app_settings").updateOne(
    { _id: "google_credentials" },
    { $set: { clientId, clientSecret, updatedAt: new Date().toISOString() } },
    { upsert: true }
  );
  console.log("Google credentials migrated to MongoDB successfully.");
  console.log(
    "You can now remove googleClientId/googleClientSecret from data/app-config.json if you like."
  );
} finally {
  await client.close();
}
