import { NextResponse } from "next/server";
import {
  isLegacyPasswordLogin,
  needsSetupWizard,
} from "@/lib/setupWizard";
import { isSetupComplete } from "@/lib/appConfig";

export async function GET() {
  return NextResponse.json({
    needsWizard: needsSetupWizard(),
    legacyLogin: isLegacyPasswordLogin(),
    setupComplete: isSetupComplete(),
  });
}