import type { AppDataStore } from "@/lib/dataStore/types";
import { readAppConfig } from "@/lib/appConfig";
import { createMongoStore } from "@/lib/dataStore/mongoStore";

let cachedKey = "";
let cachedStore: AppDataStore | null = null;

function configKey(): string {
  const c = readAppConfig();
  return JSON.stringify({
    e: c?.engine,
    s: c?.setupComplete,
    m: c?.mongoUri,
    p: c?.postgresUrl,
    q: c?.sqlitePath,
  });
}

export async function getDataStore(): Promise<AppDataStore> {
  const k = configKey();
  if (cachedStore && k === cachedKey) return cachedStore;
  const cfg = readAppConfig();
  const engine = cfg?.setupComplete && cfg.engine ? cfg.engine : "mongo";
  if (engine === "postgres" || engine === "sqlite") {
    const mod = await import("@/lib/dataStore/sqlStore");
    cachedStore = await mod.createSqlStore(engine);
  } else {
    cachedStore = await createMongoStore();
  }
  cachedKey = k;
  return cachedStore;
}

export function invalidateDataStoreCache(): void {
  cachedKey = "";
  cachedStore = null;
}
