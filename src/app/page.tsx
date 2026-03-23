import { redirect } from "next/navigation";
import GTDBoard from "@/components/GTDBoard";
import { hasServerEditSession } from "@/lib/auth-server";
import { isAuthDisabled } from "@/lib/auth";

export default async function Home() {
  if (!isAuthDisabled() && !(await hasServerEditSession())) {
    redirect("/login");
  }

  return <GTDBoard />;
}
