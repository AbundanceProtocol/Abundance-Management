"use client";

import {
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

/**
 * DnD sensors for task/page lists: mouse/stylus use movement threshold; touch
 * uses TouchSensor so drags work reliably on mobile (PointerSensor alone is flaky on some browsers).
 */
export function useBoardDndSensors() {
  return useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 8,
      },
    })
  );
}
