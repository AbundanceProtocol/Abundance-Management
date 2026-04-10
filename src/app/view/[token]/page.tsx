import { SharedBoardView } from "@/components/SharedBoardView";
import type { Section, TaskItem } from "@/lib/types";

async function loadSharedData(token: string): Promise<{
  viewName: string;
  sections: Section[];
  tasks: TaskItem[];
} | null> {
  try {
    const base =
      process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
      process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
      "http://localhost:3000";
    const res = await fetch(`${base}/api/shared/${token}`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function SharedViewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await loadSharedData(token);

  if (!data) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "var(--bg-primary)",
          color: "var(--text-primary)",
          flexDirection: "column",
          gap: 12,
          padding: 24,
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Link not found</p>
        <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
          This shared view link is invalid or has been deleted.
        </p>
      </div>
    );
  }

  return <SharedBoardView viewName={data.viewName} sections={data.sections} tasks={data.tasks} />;
}
