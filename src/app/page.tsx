import { Suspense } from "react";
import { redirect } from "next/navigation";
import GTDBoard from "@/components/GTDBoard";
import { hasServerEditSession } from "@/lib/auth-server";
import { isAuthDisabled } from "@/lib/auth";
import { needsSetupWizard } from "@/lib/setupWizard";

function BoardFallback() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "40vh",
        color: "var(--text-muted)",
        fontSize: 14,
      }}
    >
      Loading…
    </div>
  );
}

export default async function Home() {
  if (!isAuthDisabled() && needsSetupWizard()) {
    redirect("/setup");
  }
  if (!isAuthDisabled() && !(await hasServerEditSession())) {
    redirect("/login");
  }

  return (
    <Suspense fallback={<BoardFallback />}>
      <GTDBoard />
    </Suspense>
  );
}