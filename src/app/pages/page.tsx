import { redirect } from "next/navigation";
import PagesView from "@/components/PagesView";
import { hasServerEditSession } from "@/lib/auth-server";
import { isAuthDisabled } from "@/lib/auth";

export default async function PagesPage() {
  if (!isAuthDisabled() && !(await hasServerEditSession())) {
    redirect("/login");
  }

  return <PagesView />;
}
