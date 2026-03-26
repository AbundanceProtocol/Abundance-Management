"use client";

import { useSyncExternalStore } from "react";

/** Same breakpoint as pages / page editor narrow layout (max-width: 768px). */
export const VIEWPORT_NARROW_MQ = "(max-width: 768px)";

export function useViewportNarrow() {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {};
      const mq = window.matchMedia(VIEWPORT_NARROW_MQ);
      mq.addEventListener("change", onStoreChange);
      return () => mq.removeEventListener("change", onStoreChange);
    },
    () =>
      typeof window !== "undefined"
        ? window.matchMedia(VIEWPORT_NARROW_MQ).matches
        : false,
    () => false
  );
}
