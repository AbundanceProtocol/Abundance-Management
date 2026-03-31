import { redirect } from "next/navigation";
import MindMapsView from "@/components/MindMapsView";
import { hasServerEditSession } from "@/lib/auth-server";
import { isAuthDisabled } from "@/lib/auth";
import { needsSetupWizard } from "@/lib/setupWizard";

export default async function MindMapsPage() {
  if (!isAuthDisabled() && needsSetupWizard()) {
    redirect("/setup");
  }
  if (!isAuthDisabled() && !(await hasServerEditSession())) {
    redirect("/login");
  }

  return <MindMapsView />;
}
