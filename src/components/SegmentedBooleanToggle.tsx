"use client";

import { useId } from "react";

const TRACK_W = 46;
const TRACK_H = 26;
const THUMB = 20;
const INSET = 3;

/** Narrow header: proportionally smaller track + thumb. */
const TRACK_W_COMPACT = 36;
const TRACK_H_COMPACT = 22;
const THUMB_COMPACT = 16;
const INSET_COMPACT = 2;

type Props = {
  /** Shown beside the switch. */
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  /** Tooltip on hover. */
  title?: string;
  /** Narrow layouts: smaller label text. */
  compact?: boolean;
};

/** Graphic on/off switch (track + thumb), label on the left. */
export default function SegmentedBooleanToggle({
  label,
  value,
  onChange,
  title,
  compact = false,
}: Props) {
  const labelId = useId();

  const tw = compact ? TRACK_W_COMPACT : TRACK_W;
  const th = compact ? TRACK_H_COMPACT : TRACK_H;
  const thumb = compact ? THUMB_COMPACT : THUMB;
  const inset = compact ? INSET_COMPACT : INSET;
  const thumbOnLeft = tw - inset - thumb;
  const thumbTop = (th - thumb) / 2;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: compact ? 6 : 10,
        flexWrap: "wrap",
      }}
    >
      <span
        id={labelId}
        style={{
          fontSize: compact ? 10 : 13,
          color: "var(--text-muted)",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-labelledby={labelId}
        title={title}
        onClick={() => onChange(!value)}
        className="outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-blue)] focus-visible:outline-offset-2"
        style={{
          position: "relative",
          width: tw,
          height: th,
          flexShrink: 0,
          borderRadius: 999,
          border: "1px solid var(--border-color)",
          padding: 0,
          cursor: "pointer",
          background: value ? "var(--accent-blue)" : "var(--bg-tertiary)",
          transition: "background 0.2s ease",
        }}
      >
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: thumbTop,
            left: value ? thumbOnLeft : inset,
            width: thumb,
            height: thumb,
            borderRadius: "50%",
            background: "var(--text-primary)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.45)",
            transition: "left 0.2s ease",
          }}
        />
      </button>
    </div>
  );
}
