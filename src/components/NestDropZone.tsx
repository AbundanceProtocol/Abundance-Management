"use client";

import React from "react";
import { useDroppable } from "@dnd-kit/core";
import { NEST_BELOW_PREFIX } from "@/lib/constants";

export function nestBelowId(taskId: string): string {
  return `${NEST_BELOW_PREFIX}${taskId}`;
}

/** Thin hit target *below* a task row: short hover + drop = reorder after; long hover = nest into parent. */
export default function NestDropZone({ taskId }: { taskId: string }) {
  const id = nestBelowId(taskId);
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { type: "nest-below", taskId },
  });

  return (
    <div
      ref={setNodeRef}
      className="nest-drop-zone"
      style={{
        height: 14,
        marginTop: -4,
        marginBottom: -4,
        borderRadius: 4,
        borderTop: "1px dashed transparent",
        pointerEvents: "auto",
        ...(isOver
          ? {
              background: "rgba(75, 156, 245, 0.18)",
              boxShadow: "inset 0 0 0 1px rgba(75, 156, 245, 0.35)",
            }
          : {}),
      }}
      aria-hidden
      title=""
    />
  );
}
