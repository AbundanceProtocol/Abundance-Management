import type { Section } from "@/lib/types";

/** Dedicated board scopes by section type (URL `?view=`). */
export type TasksViewFilter = "all" | "recurring" | "todo" | "project";

const VALID: TasksViewFilter[] = ["all", "recurring", "todo", "project"];

export function parseTasksViewParam(raw: string | null): TasksViewFilter {
  if (!raw) return "all";
  const v = raw.toLowerCase().trim();
  return VALID.includes(v as TasksViewFilter) ? (v as TasksViewFilter) : "all";
}

export function filterSectionsByTasksView(
  sections: Section[],
  view: TasksViewFilter
): Section[] {
  if (view === "all") return sections;
  return sections.filter((s) => {
    if (view === "recurring") return s.type === "recurring";
    if (view === "todo") return s.type === "todo";
    if (view === "project") return s.type === "project";
    return true;
  });
}

export function tasksViewShortLabel(view: TasksViewFilter): string {
  switch (view) {
    case "all":
      return "All sections";
    case "recurring":
      return "Recurring";
    case "todo":
      return "To-do";
    case "project":
      return "Projects";
  }
}

export function tasksViewDescription(view: TasksViewFilter): string {
  switch (view) {
    case "all":
      return "All section types";
    case "recurring":
      return "Habits & scheduled repeats";
    case "todo":
      return "Simple lists";
    case "project":
      return "Critical path & timelines";
  }
}
