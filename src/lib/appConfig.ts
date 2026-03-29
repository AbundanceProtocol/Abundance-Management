import fs from "fs";
import path from "path";

export type DbEngine = "mongo" | "postgres" | "sqlite";

export type AppConfigFile = {
  setupComplete?: boolean;
  engine?: DbEngine;
  databaseVariant?: string;
  mongoUri?: string;
  mongoDbName?: string;
  postgresUrl?: string;
  sqlitePath?: string;
  authSecret?: string;
};

const CONFIG_DIR = path.join(process.cwd(), "data");
const CONFIG_PATH = path.join(CONFIG_DIR, "app-config.json");

export function getAppConfigPath(): string {
  return CONFIG_PATH;
}

export function readAppConfig(): AppConfigFile | null {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    return JSON.parse(raw) as AppConfigFile;
  } catch {
    return null;
  }
}

export function writeAppConfig(config: AppConfigFile): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

export function getAuthSecret(): string {
  const cfg = readAppConfig();
  const fromFile = cfg?.authSecret?.trim();
  if (fromFile) return fromFile;
  return process.env.AUTH_SECRET ?? "";
}

export function isSetupComplete(): boolean {
  return readAppConfig()?.setupComplete === true;
}
