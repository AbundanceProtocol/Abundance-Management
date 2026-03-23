import { NextResponse } from "next/server";
import { getAuthState } from "@/lib/auth";

export async function GET(request: Request) {
  const { canRead, canEdit } = getAuthState(request);
  return NextResponse.json({
    authenticated: canEdit,
    canRead,
    canEdit,
  });
}
