import { isAuthDisabled } from "@/lib/auth";
import { getAuthSecret, isSetupComplete, readAppConfig } from "@/lib/appConfig";

export function needsSetupWizard(): boolean {
  if (isAuthDisabled()) return false;
  if (isSetupComplete()) return false;
  if (process.env.APP_PASSWORD?.trim()) return false;
  return Boolean(getAuthSecret().trim());
}

export function isLegacyPasswordLogin(): boolean {
  if (isAuthDisabled()) return false;
  if (isSetupComplete()) return false;
  return Boolean(process.env.APP_PASSWORD?.trim());
}

export function getConfiguredEngine(): "mongo" | "postgres" | "sqlite" {
  const c = readAppConfig();
  if (c?.setupComplete && c.engine) return c.engine;
  return "mongo";
}