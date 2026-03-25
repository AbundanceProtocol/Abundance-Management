import { redirect } from "next/navigation";
import TaskZoomView from "@/components/TaskZoomView";
import { hasServerEditSession } from "@/lib/auth-server";
import { isAuthDisabled } from "@/lib/auth";

export default async function TaskZoomPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  if (!isAuthDisabled() && !(await hasServerEditSession())) {
    redirect("/login");
  }

  const { taskId } = await params;

  return <TaskZoomView taskId={taskId} />;
}
