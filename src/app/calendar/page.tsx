import { redirect } from "next/navigation";
import CalendarStandaloneView from "@/components/CalendarStandaloneView";
import { hasServerEditSession } from "@/lib/auth-server";
import { isAuthDisabled } from "@/lib/auth";
import { needsSetupWizard } from "@/lib/setupWizard";

export default async function CalendarPage() {
  if (!isAuthDisabled() && needsSetupWizard()) {
    redirect("/setup");
  }
  if (!isAuthDisabled() && !(await hasServerEditSession())) {
    redirect("/login");
  }

  return <CalendarStandaloneView />;
}
