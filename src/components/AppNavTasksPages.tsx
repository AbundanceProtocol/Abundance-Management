"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { SEGMENTED_ACTIVE } from "@/lib/segmentedControlStyles";
import { Calendar, ClipboardList, FileText, MindMap } from "./Icons";

const SEGMENT_BASE: CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  padding: "6px 10px",
  border: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  textDecoration: "none",
  boxSizing: "border-box",
  minHeight: 32,
  flex: "1 1 0",
  minWidth: 0,
  whiteSpace: "nowrap",
};

const SEGMENT_BASE_COMPACT: CSSProperties = {
  ...SEGMENT_BASE,
  fontSize: 10,
  padding: "4px 6px",
  minHeight: 24,
  gap: 3,
};

type Density = "full" | "abbrev" | "icons";

type NavSegment = {
  key: string;
  labelFull: string;
  href: string;
  icon: ReactNode;
};

const ICON_SIZE = 13;
const ICON_SIZE_COMPACT = 11;

/** Keep icons visible when the segment label is long (e.g. "Mind Maps") — SVG flex children can shrink to 0 width. */
const NAV_ICON_WRAP: CSSProperties = {
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  lineHeight: 0,
};

function makeSegments(compact: boolean): NavSegment[] {
  const s = compact ? ICON_SIZE_COMPACT : ICON_SIZE;
  return [
    {
      key: "tasks",
      labelFull: "Tasks",
      href: "/",
      icon: <ClipboardList size={s} />,
    },
    {
      key: "pages",
      labelFull: "Pages",
      href: "/pages",
      icon: <FileText size={s} />,
    },
    {
      key: "mind-maps",
      labelFull: "Mind Maps",
      href: "/mind-maps",
      icon: <MindMap size={s} />,
    },
    {
      key: "calendar",
      labelFull: "Calendar",
      href: "/calendar",
      icon: <Calendar size={s} />,
    },
  ];
}

function segmentLabel(seg: NavSegment, density: Density): string {
  if (density === "icons") return "";
  if (density === "abbrev" && seg.key === "mind-maps") return "Map";
  if (density === "abbrev" && seg.key === "calendar") return "Cal";
  return seg.labelFull;
}

function measureStrip(
  segments: NavSegment[],
  density: Density,
  segStyle: CSSProperties,
): ReactNode {
  return (
    <>
      {segments.map((s, i) => {
        const border: CSSProperties =
          i > 0 ? { borderLeft: "1px solid var(--border-color)" } : {};
        const label = segmentLabel(s, density);
        return (
          <span
            key={s.key}
            style={{ ...segStyle, ...border, flex: "0 0 auto", minWidth: "auto" }}
          >
            <span style={NAV_ICON_WRAP}>{s.icon}</span>
            {label}
          </span>
        );
      })}
    </>
  );
}

export function AppNavTasksPages({
  active,
  compact = false,
}: {
  active: "tasks" | "pages" | "mind-maps" | "calendar";
  compact?: boolean;
}) {
  const seg = compact ? SEGMENT_BASE_COMPACT : SEGMENT_BASE;
  const segments = makeSegments(compact);
  const outerRef = useRef<HTMLDivElement>(null);
  const measureFullRef = useRef<HTMLDivElement>(null);
  const measureAbbrevRef = useRef<HTMLDivElement>(null);
  const [density, setDensity] = useState<Density>("full");

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const mFull = measureFullRef.current;
    const mAbbrev = measureAbbrevRef.current;
    if (!outer || !mFull || !mAbbrev) return;

    const update = () => {
      const available = outer.getBoundingClientRect().width;
      if (available < 1) return;
      const fullW = mFull.getBoundingClientRect().width;
      const abbrevW = mAbbrev.getBoundingClientRect().width;
      let next: Density = "icons";
      if (fullW <= available) next = "full";
      else if (abbrevW <= available) next = "abbrev";
      setDensity(next);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(outer);
    return () => ro.disconnect();
  }, [compact]);

  const measureCommon: CSSProperties = {
    position: "absolute",
    left: -100000,
    top: 0,
    display: "inline-flex",
    visibility: "hidden",
    pointerEvents: "none",
    borderRadius: 8,
    border: "1px solid var(--border-color)",
    overflow: "hidden",
  };

  return (
    <div ref={outerRef} style={{ width: "100%", position: "relative" }}>
      <div ref={measureFullRef} style={measureCommon} aria-hidden>
        {measureStrip(segments, "full", seg)}
      </div>
      <div ref={measureAbbrevRef} style={measureCommon} aria-hidden>
        {measureStrip(segments, "abbrev", seg)}
      </div>

      <div
        role="navigation"
        aria-label="Main area"
        style={{
          display: "flex",
          width: "100%",
          maxWidth: "100%",
          borderRadius: 8,
          border: "1px solid var(--border-color)",
          overflow: "hidden",
        }}
      >
        {segments.map((s, i) => {
          const isActive = s.key === active;
          const border: CSSProperties =
            i > 0 ? { borderLeft: "1px solid var(--border-color)" } : {};
          const label = segmentLabel(s, density);
          const needsOverride =
            density === "icons" ||
            (density === "abbrev" && (s.key === "mind-maps" || s.key === "calendar"));
          const a11yOverride = needsOverride ? s.labelFull : undefined;
          const tip = needsOverride ? s.labelFull : undefined;
          const content = (
            <>
              <span style={NAV_ICON_WRAP}>{s.icon}</span>
              {label}
            </>
          );
          if (isActive) {
            return (
              <span
                key={s.key}
                aria-current="page"
                aria-label={a11yOverride}
                title={tip}
                style={{ ...seg, ...SEGMENTED_ACTIVE, ...border, cursor: "default" }}
              >
                {content}
              </span>
            );
          }
          return (
            <Link
              key={s.key}
              href={s.href}
              aria-label={a11yOverride}
              title={tip}
              style={{
                ...seg,
                ...border,
                background: "transparent",
                color: "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              {content}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
