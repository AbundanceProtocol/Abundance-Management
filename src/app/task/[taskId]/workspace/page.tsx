import { redirect } from "next/navigation";
import TaskWorkspaceView from "@/components/TaskWorkspaceView";
import { hasServerEditSession } from "@/lib/auth-server";
import { isAuthDisabled } from "@/lib/auth";

export default async function TaskWorkspacePage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  if (!isAuthDisabled() && !(await hasServerEditSession())) {
    redirect("/login");
  }

  const { taskId } = await params;

  return <TaskWorkspaceView taskId={taskId} />;
}
