import { redirect } from "next/navigation";
import PagesView from "@/components/PagesView";
import { hasServerEditSession } from "@/lib/auth-server";
import { isAuthDisabled } from "@/lib/auth";
import { needsSetupWizard } from "@/lib/setupWizard";

export default async function PagesPage() {
  if (!isAuthDisabled() && needsSetupWizard()) {
    redirect("/setup");
  }
  if (!isAuthDisabled() && !(await hasServerEditSession())) {
    redirect("/login");
  }

  return <PagesView />;
}